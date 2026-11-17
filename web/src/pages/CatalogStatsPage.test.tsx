import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AuthProvider } from "../lib/AuthContext";
import type { Game } from "../lib/types";
import CatalogStatsPage, { computeCatalogStats } from "./CatalogStatsPage";

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
    isFavorited: true,
    expansions: [{ id: "e1", name: "Seafarers" }],
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
});

describe("CatalogStatsPage", () => {
  it("computes counts by category, number of players, play time, and weight", () => {
    const stats = computeCatalogStats(SAMPLE_GAMES);
    expect(stats.totalGames).toBe(3);
    expect(stats.totalExpansions).toBe(1);
    expect(stats.favoritesCount).toBe(1);
    expect(stats.distinctCategories).toBe(6);

    // Economic appears on 2 games
    expect(stats.categoryCounts[0]).toEqual({ category: "Economic", count: 2 });

    // Player counts: 1p (Wingspan = 1), 2p (Wingspan, Codenames = 2), 3p (all 3 = 3), 4p (all 3 = 3), 8+ (Codenames = 1)
    expect(stats.playerCounts.find((p) => p.players === 1)?.count).toBe(1);
    expect(stats.playerCounts.find((p) => p.players === 2)?.count).toBe(2);
    expect(stats.playerCounts.find((p) => p.players === 3)?.count).toBe(3);
    expect(stats.playerCounts.find((p) => p.players === 4)?.count).toBe(3);
    expect(stats.playerCounts.find((p) => p.players === 8)?.count).toBe(1);
  });

  it("renders catalog statistics breakdown", async () => {
    vi.mocked(api.getGames).mockResolvedValue(SAMPLE_GAMES);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/catalog/stats"]}>
          <AuthProvider>
            <CatalogStatsPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /Catalog Statistics/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Games by Category/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Games by Number of Players/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Economic")).toBeInTheDocument();
    expect(screen.getByText("Negotiation")).toBeInTheDocument();
    expect(screen.getByText("Party Game")).toBeInTheDocument();
    expect(screen.getByText("4 players")).toBeInTheDocument();
  });
});
