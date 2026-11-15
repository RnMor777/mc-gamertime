import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import type { Game } from "../lib/types";
import { applyFilters, DEFAULT_FILTERS, getNewGamePks } from "./CatalogFilters";
import { GamePicker, sortGames } from "./GamePicker";

vi.mock("../lib/api");

const DAY_MS = 24 * 60 * 60 * 1000;

function makeGame(pk: string, name: string, createdAt: string): Game {
  return {
    pk,
    name,
    tags: [],
    createdAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "alice",
    role: "normal",
    displayName: "Alice",
  });
  vi.mocked(api.getLibraries).mockResolvedValue([]);
  vi.mocked(api.getResults).mockResolvedValue([]);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("getNewGamePks, sortGames, and applyFilters", () => {
  it("marks at most the 5 newest games that were added within the past week", () => {
    const now = Date.parse("2026-11-15T12:00:00Z");
    const games = [
      makeGame("g1", "One", new Date(now - 1 * DAY_MS).toISOString()),
      makeGame("g2", "Two", new Date(now - 2 * DAY_MS).toISOString()),
      makeGame("g3", "Three", new Date(now - 3 * DAY_MS).toISOString()),
      makeGame("g4", "Four", new Date(now - 4 * DAY_MS).toISOString()),
      makeGame("g5", "Five", new Date(now - 5 * DAY_MS).toISOString()),
      makeGame("g6", "Six", new Date(now - 6 * DAY_MS).toISOString()),
      makeGame("g7", "Old", new Date(now - 10 * DAY_MS).toISOString()),
    ];

    const newPks = getNewGamePks(games, now);
    expect([...newPks]).toEqual(["g1", "g2", "g3", "g4", "g5"]);
    expect(newPks.has("g6")).toBe(false);
    expect(newPks.has("g7")).toBe(false);
  });

  it("excludes games among the newest 5 if they were added more than a week ago", () => {
    const now = Date.parse("2026-11-15T12:00:00Z");
    const games = [
      makeGame("g1", "Recent 1", new Date(now - 2 * DAY_MS).toISOString()),
      makeGame("g2", "Recent 2", new Date(now - 5 * DAY_MS).toISOString()),
      makeGame("g3", "Older 1", new Date(now - 8 * DAY_MS).toISOString()),
      makeGame("g4", "Older 2", new Date(now - 14 * DAY_MS).toISOString()),
    ];

    const newPks = getNewGamePks(games, now);
    expect([...newPks]).toEqual(["g1", "g2"]);

    const filtered = applyFilters(games, { ...DEFAULT_FILTERS, newlyAdded: true }, now);
    expect(filtered.map((g) => g.pk)).toEqual(["g1", "g2"]);
  });

  it("sorts games by when they were added", () => {
    const games = [
      makeGame("g1", "Catan", "2026-11-10T10:00:00Z"),
      makeGame("g2", "Azul", "2026-11-14T10:00:00Z"),
      makeGame("g3", "Wingspan", "2026-11-01T10:00:00Z"),
    ];

    expect(sortGames(games, "added-desc").map((g) => g.name)).toEqual([
      "Azul",
      "Catan",
      "Wingspan",
    ]);
    expect(sortGames(games, "added-asc").map((g) => g.name)).toEqual(["Wingspan", "Catan", "Azul"]);
  });
});

describe("GamePicker component", () => {
  it("displays the New tag on newly added games and sorts by added date", async () => {
    const now = Date.now();
    vi.mocked(api.getGames).mockResolvedValue([
      makeGame("g-old", "Carcassonne", new Date(now - 14 * DAY_MS).toISOString()),
      makeGame("g-new", "Ark Nova", new Date(now - 1 * DAY_MS).toISOString()),
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AuthProvider>
            <GamePicker />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Ark Nova");
    await screen.findByText("Carcassonne");

    // Only the game added in the past week gets the "New" badge
    const newBadges = screen.getAllByText("New");
    expect(newBadges).toHaveLength(1);

    // Sort by Added: Oldest puts Carcassonne first
    const sortSelect = screen.getByLabelText("Sort games");
    fireEvent.change(sortSelect, { target: { value: "added-asc" } });
    const linksAsc = screen
      .getAllByRole("link")
      .map((el) => el.textContent)
      .filter(Boolean);
    expect(linksAsc).toEqual(["Carcassonne", "Ark Nova"]);

    // Sort by Added: Newest puts Ark Nova first
    fireEvent.change(sortSelect, { target: { value: "added-desc" } });
    const linksDesc = screen
      .getAllByRole("link")
      .map((el) => el.textContent)
      .filter(Boolean);
    expect(linksDesc).toEqual(["Ark Nova", "Carcassonne"]);
  });
});
