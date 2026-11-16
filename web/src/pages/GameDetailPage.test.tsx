import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import GameDetailPage from "./GameDetailPage";

vi.mock("../lib/api");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "alice",
    role: "normal",
    displayName: "Alice",
  });
  vi.mocked(api.getLibraries).mockResolvedValue([
    {
      id: "personal:alice",
      name: "Alice's Library",
      isPersonal: true,
      ownerId: "alice",
      myRole: "owner",
      members: [],
      gameCount: 1,
    },
  ]);
  vi.mocked(api.getResults).mockResolvedValue([]);
  vi.mocked(api.getPosts).mockResolvedValue([]);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function renderGameDetail(gameId = "g1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/games/${gameId}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/games/:id" element={<GameDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GameDetailPage rulebooks", () => {
  it("renders Rulebooks section above Expansions and opens PDF pop-up dialog when clicked", async () => {
    vi.mocked(api.getGames).mockResolvedValue([
      {
        pk: "g1",
        name: "Catan",
        tags: [],
        createdAt: "2026-11-15T00:00:00Z",
        rulebooks: [
          {
            id: "rb1",
            name: "Base Game Rules",
            filename: "catan-rules.pdf",
            url: "/api/games/g1/rulebooks/rb1/file",
            size: 204800,
            uploadedAt: "2026-11-15T01:00:00Z",
          },
          {
            id: "rb2",
            name: "Almanac",
            filename: "catan-almanac.pdf",
            url: "/api/games/g1/rulebooks/rb2/file",
            size: 102400,
            uploadedAt: "2026-11-15T02:00:00Z",
          },
        ],
        expansions: [
          {
            id: "exp1",
            name: "Catan: Seafarers",
          },
        ],
      },
    ]);

    renderGameDetail("g1");

    const rulebooksHeading = await screen.findByRole("heading", { name: /Rulebooks/i });
    const expansionsHeading = screen.getByRole("heading", { name: /Expansions/i });

    // Rulebooks heading appears before Expansions heading in the DOM
    expect(
      rulebooksHeading.compareDocumentPosition(expansionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByText("Base Game Rules")).toBeInTheDocument();
    expect(screen.getByText("Almanac")).toBeInTheDocument();

    // Clicking a rulebook opens the pop-up dialog with an iframe viewer
    fireEvent.click(screen.getByText("Base Game Rules"));

    const iframe = await screen.findByTitle("Base Game Rules");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "/api/games/g1/rulebooks/rb1/file");
    expect(screen.getByRole("link", { name: /Open PDF in new tab/i })).toHaveAttribute(
      "href",
      "/api/games/g1/rulebooks/rb1/file",
    );
  });

  it("uploads PDF files and rejects non-PDF files", async () => {
    vi.mocked(api.getGames).mockResolvedValue([
      {
        pk: "g1",
        name: "Catan",
        tags: [],
        createdAt: "2026-11-15T00:00:00Z",
        rulebooks: [],
        expansions: [],
      },
    ]);
    vi.mocked(api.uploadGameRulebook).mockResolvedValue({
      pk: "g1",
      name: "Catan",
      tags: [],
      createdAt: "2026-11-15T00:00:00Z",
      rulebooks: [
        {
          id: "rb1",
          name: "rules",
          filename: "rules.pdf",
          url: "/api/games/g1/rulebooks/rb1/file",
          size: 1024,
          uploadedAt: "2026-11-15T01:00:00Z",
        },
      ],
      expansions: [],
    });

    renderGameDetail("g1");

    const fileInput = await screen.findByTestId("rulebook-file-input");

    // Non-PDF file is rejected client-side
    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });
    expect(await screen.findByText(/Only PDF files \(\.pdf\) are allowed/i)).toBeInTheDocument();
    expect(api.uploadGameRulebook).not.toHaveBeenCalled();

    // Valid PDF file triggers upload
    const pdfFile = new File(["%PDF-1.7"], "rules.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    await waitFor(() => {
      expect(api.uploadGameRulebook).toHaveBeenCalledWith("g1", pdfFile, undefined);
    });
  });
});
