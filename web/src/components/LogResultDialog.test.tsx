import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import * as photos from "../lib/photos";
import type { PhotoItem, Result } from "../lib/types";
import { LogResultDialog } from "./LogResultDialog";

vi.mock("../lib/api");
vi.mock("../lib/photos", () => ({
  MAX_PHOTOS: 6,
  preparePhoto: vi.fn(async () => new Blob(["x"], { type: "image/webp" })),
  uploadSessionPhoto: vi.fn(),
}));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const created: Result = {
  pk: "r1",
  gameId: "g1",
  gameName: "Catan",
  date: "2026-10-01",
  players: [
    { playerId: "alice", playerName: "Alice" },
    { playerId: "bob", playerName: "Bob" },
  ],
  winnerId: "alice",
  winnerName: "Alice",
  createdAt: "2026-10-01T20:00:00Z",
};

const uploaded: PhotoItem = {
  pk: "p1",
  type: "photo",
  sessionPk: "r1",
  key: "session-images/p1.webp",
  imageUrl: "/session-images/p1.webp",
  uploaderId: "admin",
  uploaderName: "Admin",
  createdAt: "2026-10-01T20:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getGames).mockResolvedValue([]);
  vi.mocked(api.getLibraries).mockResolvedValue([]);
  vi.mocked(api.getPlayers).mockResolvedValue([]);
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "bob",
    role: "normal",
    displayName: "Bob",
  });
  // jsdom has no HTMLDialogElement.showModal/close
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  // jsdom has no object URLs
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${n++}`);
  URL.revokeObjectURL = vi.fn();
});

function renderOpen(props: { onClose: () => void; editResult?: Result }) {
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "bob",
    role: "normal",
    displayName: "Bob",
  });
  vi.mocked(api.getGames).mockResolvedValue([
    { pk: "g1", name: "Catan", tags: [], createdAt: "2026-01-01T00:00:00Z" },
  ]);
  const players = [
    { pk: "alice", displayName: "Alice" },
    { pk: "bob", displayName: "Bob" },
  ];
  vi.mocked(api.getPlayers).mockResolvedValue(players);
  vi.mocked(api.addResult).mockResolvedValue(created);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Edit mode renders the result's players straight away and looks each one
  // up in the player list, so it has to be there on first render.
  qc.setQueryData(["players"], players);
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <LogResultDialog open defaultGameId="g1" {...props} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function fillValidForm() {
  // defaultGameId="g1" preselects the game once the games query resolves.
  await screen.findByRole("option", { name: "Catan" });
  fireEvent.click(await screen.findByRole("button", { name: "Alice" }));
  fireEvent.click(screen.getByRole("button", { name: "Bob" }));
  const winnerGroup = screen.getByRole("group", { name: "Winner" });
  fireEvent.click(within(winnerGroup).getByRole("button", { name: "Alice" }));
}

function pickPhotos(count: number) {
  const files = Array.from(
    { length: count },
    (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }),
  );
  fireEvent.change(screen.getByLabelText(/photos/i), { target: { files } });
  return files;
}

describe("LogResultDialog", () => {
  it("does not fetch the player list while closed", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <LogResultDialog open={false} onClose={() => {}} defaultGameId="g1" />
          <LogResultDialog open={false} onClose={() => {}} defaultGameId="g2" />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await vi.waitFor(() => expect(api.getGames).toHaveBeenCalled());
    expect(api.getPlayers).not.toHaveBeenCalled();
  });

  it("uploads picked photos with the new result pk, then closes", async () => {
    vi.mocked(photos.uploadSessionPhoto).mockResolvedValue(uploaded);
    const onClose = vi.fn();
    renderOpen({ onClose });
    await fillValidForm();
    pickPhotos(2);
    await screen.findByAltText("Selected photo 2");

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await vi.waitFor(() => expect(photos.uploadSessionPhoto).toHaveBeenCalledTimes(2));
    expect(photos.uploadSessionPhoto).toHaveBeenCalledWith("r1", expect.any(Blob));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("ignores close requests while uploading", async () => {
    let finish!: (p: PhotoItem) => void;
    vi.mocked(photos.uploadSessionPhoto).mockReturnValue(
      new Promise<PhotoItem>((resolve) => {
        finish = resolve;
      }),
    );
    const onClose = vi.fn();
    renderOpen({ onClose });
    await fillValidForm();
    pickPhotos(1);
    await screen.findByAltText("Selected photo 1");

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    await vi.waitFor(() => expect(photos.uploadSessionPhoto).toHaveBeenCalledTimes(1));

    // Escape, the close button, and a backdrop click are all ignored mid-upload.
    const dialog = document.querySelector("dialog")!;
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.pointerDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    finish(uploaded);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("toasts a partial failure after closing", async () => {
    vi.mocked(photos.uploadSessionPhoto)
      .mockRejectedValueOnce(new Error("Photo upload failed (500)"))
      .mockResolvedValueOnce(uploaded);
    const onClose = vi.fn(() => {
      // The toast must not fire while the dialog (top layer) is still open.
      expect(toast.error).not.toHaveBeenCalled();
    });
    renderOpen({ onClose });
    await fillValidForm();
    pickPhotos(2);
    await screen.findByAltText("Selected photo 2");

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Result saved — 1 photo failed to upload. Add it from the game night card.",
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("accepts scores above 10 and sends trimmed notes", async () => {
    const onClose = vi.fn();
    renderOpen({ onClose });
    await fillValidForm();
    const [aliceScore, bobScore] = screen.getAllByPlaceholderText("Score");
    fireEvent.change(aliceScore, { target: { value: "142" } });
    fireEvent.change(bobScore, { target: { value: "-3" } });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "  birds 34, eggs 12  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await vi.waitFor(() => expect(api.addResult).toHaveBeenCalled());
    const payload = vi.mocked(api.addResult).mock.calls[0][0];
    expect(payload.players.map((p) => p.score)).toEqual([142, -3]);
    expect(payload.notes).toBe("birds 34, eggs 12");
  });

  it("clears notes with an explicit null when blanked in edit mode", async () => {
    vi.mocked(api.updateResult).mockResolvedValue(created);
    renderOpen({ onClose: vi.fn(), editResult: { ...created, notes: "old notes" } });
    // Submit looks the game up in the games query, so wait for it to resolve.
    await screen.findByRole("option", { name: "Catan" });
    const notes = await screen.findByLabelText(/notes/i);
    expect(notes).toHaveValue("old notes");
    fireEvent.change(notes, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(api.updateResult).toHaveBeenCalled());
    expect(vi.mocked(api.updateResult).mock.calls[0][1]).toMatchObject({ notes: null });
  });

  it("hides the photo picker in edit mode", async () => {
    // Positive control: the same dialog in create mode does show the picker.
    const createMode = renderOpen({ onClose: vi.fn() });
    await screen.findByRole("button", { name: "Alice" });
    expect(screen.getByLabelText(/photos/i)).toBeInTheDocument();
    createMode.unmount();

    renderOpen({ onClose: vi.fn(), editResult: created });
    await screen.findByRole("button", { name: "Save changes" });
    expect(screen.queryByLabelText(/photos/i)).not.toBeInTheDocument();
  });

  it("supports ties by selecting multiple winners", async () => {
    const onClose = vi.fn();
    renderOpen({ onClose });
    await fillValidForm();
    const winnerGroup = screen.getByRole("group", { name: "Winner" });
    fireEvent.click(within(winnerGroup).getByRole("button", { name: "Bob" }));

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await vi.waitFor(() => expect(api.addResult).toHaveBeenCalled());
    const payload = vi.mocked(api.addResult).mock.calls[0][0];
    expect(payload.winnerIds).toEqual(["alice", "bob"]);
    expect(payload.winnerNames).toEqual(["Alice", "Bob"]);
    expect(payload.winnerId).toBe("alice");
    expect(payload.winnerName).toBe("Alice & Bob");
  });

  it("supports adding guest players and marking a guest as winner", async () => {
    const onClose = vi.fn();
    renderOpen({ onClose });
    await screen.findByRole("option", { name: "Catan" });
    fireEvent.click(await screen.findByRole("button", { name: "Alice" }));

    fireEvent.change(screen.getByPlaceholderText("Add guest player…"), {
      target: { value: "Charlie" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add guest" }));

    const winnerGroup = screen.getByRole("group", { name: "Winner" });
    fireEvent.click(within(winnerGroup).getByRole("button", { name: /Charlie/ }));

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await vi.waitFor(() => expect(api.addResult).toHaveBeenCalled());
    const payload = vi.mocked(api.addResult).mock.calls[0][0];
    expect(payload.players).toHaveLength(2);
    const guest = payload.players.find((p) => p.isGuest);
    expect(guest).toBeDefined();
    expect(guest?.playerName).toBe("Charlie");
    expect(guest?.playerId).toMatch(/^guest:charlie-/);
    expect(payload.winnerIds).toEqual([guest!.playerId]);
    expect(payload.winnerNames).toEqual(["Charlie"]);
  });
});
