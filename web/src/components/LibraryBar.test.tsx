import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setStoredLibraryId } from "../hooks/useLibraries";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import type { Library } from "../lib/types";
import { LibraryBar } from "./LibraryBar";

vi.mock("../lib/api");
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const sampleLibraries: Library[] = [
  {
    id: "01PERSONAL_ALICE",
    name: "Alice's Library",
    isPersonal: true,
    ownerId: "alice",
    myRole: "owner",
    members: [{ username: "alice", displayName: "Alice", role: "owner" }],
    gameCount: 2,
  },
  {
    id: "fam-1",
    name: "Smith Family",
    isPersonal: false,
    ownerId: "alice",
    myRole: "owner",
    members: [
      { username: "alice", displayName: "Alice", role: "owner" },
      { username: "bob", displayName: "Bob", role: "readonly" },
    ],
    gameCount: 5,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setStoredLibraryId("alice", null);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "alice",
    role: "normal",
    displayName: "Alice",
  });
  vi.mocked(api.getLibraries).mockResolvedValue(sampleLibraries);
  vi.mocked(api.getPlayers).mockResolvedValue([
    { pk: "alice", displayName: "Alice" },
    { pk: "bob", displayName: "Bob" },
    { pk: "carol", displayName: "Carol" },
  ]);
});

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <LibraryBar />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("LibraryBar", () => {
  it("switches between personal and family libraries and lets the family owner manage members", async () => {
    const user = userEvent.setup();
    renderBar();

    const select = await screen.findByLabelText("Select library");
    await waitFor(() => expect(select).toHaveValue("01PERSONAL_ALICE"));
    expect(screen.getByText("Private")).toBeInTheDocument();

    // Switch to Smith Family library
    await user.selectOptions(select, "fam-1");
    expect(select).toHaveValue("fam-1");
    expect(screen.getByText(/Owner · 2 members/)).toBeInTheDocument();

    // Open Manage Family dialog
    await user.click(screen.getByRole("button", { name: /Manage Family/i }));
    expect(await screen.findByText("Manage Smith Family")).toBeInTheDocument();

    // Add Carol to family library
    vi.mocked(api.addLibraryMember).mockResolvedValue(sampleLibraries[1]);
    const userSelect = await screen.findByLabelText("User to add");
    await user.selectOptions(userSelect, "carol");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() =>
      expect(api.addLibraryMember).toHaveBeenCalledWith("fam-1", "carol", "editor"),
    );
  });

  it("allows a normal user to create a new family library", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createLibrary).mockResolvedValue({
      id: "fam-2",
      name: "Weekend Crew",
      isPersonal: false,
      ownerId: "alice",
      myRole: "owner",
      members: [{ username: "alice", displayName: "Alice", role: "owner" }],
      gameCount: 0,
    });

    renderBar();
    await screen.findByLabelText("Select library");
    await user.click(screen.getByRole("button", { name: /New Family Library/i }));

    const input = screen.getByPlaceholderText(/Family library name/i);
    await user.type(input, "Weekend Crew");
    await user.click(screen.getByRole("button", { name: "Create Library" }));

    await waitFor(() => expect(api.createLibrary).toHaveBeenCalledWith("Weekend Crew"));
  });
});
