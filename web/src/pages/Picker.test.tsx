import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import type { Game } from "../lib/types";
import Picker from "./Picker";

vi.mock("../lib/api");

const SAMPLE_GAMES: Game[] = [
  {
    pk: "g1",
    name: "Catan",
    minPlayers: 3,
    maxPlayers: 4,
    playTime: 60,
    weight: 2.3,
    categories: ["Economic", "Negotiation"],
    tags: ["Economic", "Negotiation"],
    createdAt: "2026-11-10T00:00:00Z",
  },
  {
    pk: "g2",
    name: "Wingspan",
    minPlayers: 1,
    maxPlayers: 5,
    playTime: 70,
    weight: 2.4,
    categories: ["Animals", "Card Game", "Economic"],
    tags: ["Animals", "Card Game", "Economic"],
    createdAt: "2026-11-12T00:00:00Z",
  },
  {
    pk: "g3",
    name: "Codenames",
    minPlayers: 2,
    maxPlayers: 8,
    playTime: 15,
    weight: 1.3,
    categories: ["Party Game", "Word Game"],
    tags: ["Party Game", "Word Game"],
    createdAt: "2026-11-14T00:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "alice",
    role: "normal",
    displayName: "Alice",
  });
  vi.mocked(api.getLibraries).mockResolvedValue([]);
  vi.mocked(api.getGames).mockResolvedValue(SAMPLE_GAMES);
  vi.mocked(api.getResults).mockResolvedValue([
    {
      pk: "r1",
      gameId: "g1",
      gameName: "Catan",
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      players: [{ playerId: "alice", playerName: "Alice" }],
      winnerId: "alice",
      winnerName: "Alice",
      createdAt: "2026-11-10T00:00:00Z",
    },
  ]);
});

describe("Picker page", () => {
  it("supports player options up to 8+ and searching/filtering by categories", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/picker"]}>
          <AuthProvider>
            <Picker />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("3 games match")).toBeInTheDocument();

    // Verify player options include 6, 7, and 8+ (instead of 5+)
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7" })).toBeInTheDocument();
    const eightPlusBtn = screen.getByRole("button", { name: "8+" });
    expect(eightPlusBtn).toBeInTheDocument();

    // Clicking 8+ filters to only Codenames (maxPlayers: 8)
    fireEvent.click(eightPlusBtn);
    expect(screen.getByText("1 game matches")).toBeInTheDocument();

    // Reset players to Any
    fireEvent.click(screen.getAllByRole("button", { name: "Any" })[0]);
    expect(screen.getByText("3 games match")).toBeInTheDocument();

    // Search categories
    const searchInput = screen.getByPlaceholderText("Search categories…");
    fireEvent.change(searchInput, { target: { value: "econ" } });
    expect(screen.getByRole("button", { name: "Economic" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Party Game" })).not.toBeInTheDocument();

    // Select "Economic" category -> 2 games match (Catan & Wingspan)
    fireEvent.click(screen.getByRole("button", { name: "Economic" }));
    expect(screen.getByText("2 games match")).toBeInTheDocument();

    // Filter by Last played -> Never played (only Wingspan among Economic games)
    fireEvent.click(screen.getByRole("button", { name: "Never played" }));
    expect(screen.getByText("1 game matches")).toBeInTheDocument();
  });
});
