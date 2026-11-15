import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import type { PhotoItem } from "../lib/types";
import { SessionPhotos } from "./SessionPhotos";

vi.mock("../lib/api");

const photo = (pk: string, uploaderId: string): PhotoItem => ({
  pk,
  type: "photo",
  sessionPk: "s1",
  key: `session-images/${pk}.webp`,
  imageUrl: `/session-images/${pk}.webp`,
  uploaderId,
  uploaderName: uploaderId,
  createdAt: "2026-06-01T00:00:00Z",
});

function renderAs(sub: string, role: "admin" | "normal", items: PhotoItem[]) {
  vi.mocked(api.getCurrentUser).mockResolvedValue({ sub, role, displayName: sub });
  vi.mocked(api.getReactions).mockResolvedValue(items);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SessionPhotos sessionPk="s1" />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no HTMLDialogElement.showModal/close
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("SessionPhotos", () => {
  it("shows Add photo below the cap", async () => {
    renderAs("bob", "normal", [photo("p1", "alice")]);
    expect(await screen.findByRole("button", { name: /add photo/i })).toBeInTheDocument();
  });

  it("hides Add photo at 6", async () => {
    renderAs(
      "bob",
      "normal",
      ["1", "2", "3", "4", "5", "6"].map((i) => photo(`p${i}`, "alice")),
    );
    await screen.findAllByRole("img");
    expect(screen.queryByRole("button", { name: /add photo/i })).not.toBeInTheDocument();
  });

  it("only shows delete for own photos unless admin", async () => {
    renderAs("bob", "normal", [photo("p1", "alice"), photo("p2", "bob")]);
    await screen.findAllByRole("img");
    expect(screen.getAllByRole("button", { name: /delete photo/i })).toHaveLength(1);
  });

  it("admin can delete any photo", async () => {
    renderAs("root", "admin", [photo("p1", "alice"), photo("p2", "bob")]);
    await screen.findAllByRole("img");
    expect(screen.getAllByRole("button", { name: /delete photo/i })).toHaveLength(2);
  });

  describe("lightbox", () => {
    const three = () => [photo("p1", "alice"), photo("p2", "bob"), photo("p3", "carol")];
    const shown = () => screen.getByRole("dialog", { hidden: true }).querySelector("img");

    async function openFirst() {
      renderAs("bob", "normal", three());
      const thumbs = await screen.findAllByRole("img");
      fireEvent.click(thumbs[0].closest("button") as HTMLElement);
    }

    it("opens the clicked photo", async () => {
      await openFirst();
      expect(shown()).toHaveAttribute("src", "/session-images/p1.webp");
    });

    it("ArrowRight advances without focusing the nav buttons", async () => {
      await openFirst();
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(shown()).toHaveAttribute("src", "/session-images/p2.webp");
    });

    it("ArrowLeft from the first photo wraps to the last", async () => {
      await openFirst();
      fireEvent.keyDown(document, { key: "ArrowLeft" });
      expect(shown()).toHaveAttribute("src", "/session-images/p3.webp");
    });
  });
});
