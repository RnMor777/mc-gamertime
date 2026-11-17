import {
  BarChart3,
  ChevronLeft,
  Clock,
  Dices,
  FileText,
  Gauge,
  Layers,
  Star,
  Tag,
  Users2,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { getGameCategories } from "../components/CategorySelect";
import { LibraryBar } from "../components/LibraryBar";
import { PageTransition } from "../components/PageTransition";
import { Skeleton } from "../components/ui/skeleton";
import { useCountUp } from "../hooks/useCountUp";
import { useGames } from "../hooks/useGames";
import type { Game } from "../lib/types";
import { pluralize } from "../lib/utils";

export interface CatalogStatsSummary {
  totalGames: number;
  totalExpansions: number;
  totalRulebooks: number;
  favoritesCount: number;
  distinctCategories: number;
  uncategorizedCount: number;
  avgWeight: number | null;
  avgPlayTime: number | null;
  categoryCounts: { category: string; count: number }[];
  playerCounts: { label: string; players: number; count: number }[];
  playTimeBuckets: { label: string; count: number }[];
  weightBuckets: { label: string; count: number }[];
}

export function computeCatalogStats(games: Game[]): CatalogStatsSummary {
  const totalGames = games.length;
  let totalExpansions = 0;
  let totalRulebooks = 0;
  let favoritesCount = 0;
  let uncategorizedCount = 0;

  let weightSum = 0;
  let weightCount = 0;
  let playTimeSum = 0;
  let playTimeCount = 0;

  const categoryMap = new Map<string, number>();

  for (const g of games) {
    totalExpansions += g.expansions?.length ?? 0;
    totalRulebooks += g.rulebooks?.length ?? 0;
    if (g.isFavorited) favoritesCount++;

    if (g.weight != null && g.weight > 0) {
      weightSum += g.weight;
      weightCount++;
    }
    if (g.playTime != null && g.playTime > 0) {
      playTimeSum += g.playTime;
      playTimeCount++;
    }

    const cats = getGameCategories(g);
    if (cats.length === 0) {
      uncategorizedCount++;
    } else {
      for (const c of cats) {
        categoryMap.set(c, (categoryMap.get(c) ?? 0) + 1);
      }
    }
  }

  const categoryCounts = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const playerTargets = [1, 2, 3, 4, 5, 6, 7, 8];
  const playerCounts = playerTargets.map((n) => {
    const count = games.filter((g) => {
      if (g.minPlayers == null || g.maxPlayers == null) return false;
      if (n === 8) return g.maxPlayers >= 8;
      return g.minPlayers <= n && g.maxPlayers >= n;
    }).length;
    return {
      label: n === 8 ? "8+ players" : n === 1 ? "1 player (Solo)" : `${n} players`,
      players: n,
      count,
    };
  });

  const playTimeBuckets = [
    {
      label: "Quick (≤ 30 min)",
      count: games.filter((g) => g.playTime != null && g.playTime <= 30).length,
    },
    {
      label: "Standard (31–60 min)",
      count: games.filter((g) => g.playTime != null && g.playTime > 30 && g.playTime <= 60).length,
    },
    {
      label: "Long (61–120 min)",
      count: games.filter((g) => g.playTime != null && g.playTime > 60 && g.playTime <= 120).length,
    },
    {
      label: "Epic (120+ min)",
      count: games.filter((g) => g.playTime != null && g.playTime > 120).length,
    },
  ];

  const weightBuckets = [
    {
      label: "Light (1.0–1.9)",
      count: games.filter((g) => g.weight != null && g.weight >= 1 && g.weight < 2).length,
    },
    {
      label: "Medium-Light (2.0–2.9)",
      count: games.filter((g) => g.weight != null && g.weight >= 2 && g.weight < 3).length,
    },
    {
      label: "Medium-Heavy (3.0–3.9)",
      count: games.filter((g) => g.weight != null && g.weight >= 3 && g.weight < 4).length,
    },
    {
      label: "Heavy (4.0–5.0)",
      count: games.filter((g) => g.weight != null && g.weight >= 4).length,
    },
  ];

  return {
    totalGames,
    totalExpansions,
    totalRulebooks,
    favoritesCount,
    distinctCategories: categoryCounts.length,
    uncategorizedCount,
    avgWeight: weightCount > 0 ? weightSum / weightCount : null,
    avgPlayTime: playTimeCount > 0 ? Math.round(playTimeSum / playTimeCount) : null,
    categoryCounts,
    playerCounts,
    playTimeBuckets,
    weightBuckets,
  };
}

function BarRow({
  label,
  count,
  total,
  maxCount,
}: {
  label: string;
  count: number;
  total: number;
  maxCount: number;
}) {
  const widthPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate pr-2">{label}</span>
        <span className="text-muted-foreground shrink-0">
          <span className="font-semibold text-foreground">{count}</span>{" "}
          {pluralize(count, "game").replace(/^\d+\s+/, "")} ({sharePct}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

export default function CatalogStatsPage() {
  const { data: games = [], isLoading } = useGames();
  const stats = useMemo(() => computeCatalogStats(games), [games]);

  const animatedTotalGames = useCountUp(stats.totalGames);
  const animatedCategories = useCountUp(stats.distinctCategories);
  const animatedExpansions = useCountUp(stats.totalExpansions);

  const maxCategoryCount = Math.max(1, ...stats.categoryCounts.map((c) => c.count));
  const maxPlayerCount = Math.max(1, ...stats.playerCounts.map((p) => p.count));
  const maxPlayTimeCount = Math.max(1, ...stats.playTimeBuckets.map((b) => b.count));
  const maxWeightCount = Math.max(1, ...stats.weightBuckets.map((b) => b.count));

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <Link
            to="/catalog"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-2"
          >
            <ChevronLeft size={16} />
            Catalog
          </Link>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <BarChart3 size={24} className="text-primary" />
            Catalog Statistics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Breakdown of games in your catalog by category, player count, play time, and complexity.
          </p>
        </div>

        <LibraryBar />

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : stats.totalGames === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            <Dices size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-foreground">No games in this catalog yet</p>
            <p className="text-xs mt-1">Add games to your catalog to see collection statistics.</p>
          </div>
        ) : (
          <>
            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="rounded-xl border bg-card p-4">
                <Dices size={16} className="text-primary mb-1.5" />
                <div className="text-xs text-muted-foreground">Total Games</div>
                <div className="text-2xl font-display font-bold" data-testid="stat-total-games">
                  {animatedTotalGames}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Tag size={16} className="text-primary mb-1.5" />
                <div className="text-xs text-muted-foreground">Categories</div>
                <div className="text-2xl font-display font-bold" data-testid="stat-categories">
                  {animatedCategories}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Layers size={16} className="text-primary mb-1.5" />
                <div className="text-xs text-muted-foreground">Expansions</div>
                <div className="text-2xl font-display font-bold">{animatedExpansions}</div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Clock size={16} className="text-primary mb-1.5" />
                <div className="text-xs text-muted-foreground">Avg Play Time</div>
                <div className="text-2xl font-display font-bold">
                  {stats.avgPlayTime != null ? `${stats.avgPlayTime}m` : "—"}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Gauge size={16} className="text-primary mb-1.5" />
                <div className="text-xs text-muted-foreground">Avg Complexity</div>
                <div className="text-2xl font-display font-bold">
                  {stats.avgWeight != null ? stats.avgWeight.toFixed(1) : "—"}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-primary mb-1.5">
                  <Star size={16} />
                  <FileText size={15} />
                </div>
                <div className="text-xs text-muted-foreground">Favorites / PDFs</div>
                <div className="text-2xl font-display font-bold">
                  {stats.favoritesCount} / {stats.totalRulebooks}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Count by Category */}
              <section
                aria-labelledby="stats-by-category-heading"
                className="rounded-xl border bg-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2
                    id="stats-by-category-heading"
                    className="text-base font-display font-semibold flex items-center gap-2"
                  >
                    <Tag size={16} className="text-primary" />
                    Games by Category
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {stats.distinctCategories} categories
                  </span>
                </div>
                {stats.categoryCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No categories assigned to games yet.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {stats.categoryCounts.map(({ category, count }) => (
                      <BarRow
                        key={category}
                        label={category}
                        count={count}
                        total={stats.totalGames}
                        maxCount={maxCategoryCount}
                      />
                    ))}
                    {stats.uncategorizedCount > 0 && (
                      <BarRow
                        label="Uncategorized"
                        count={stats.uncategorizedCount}
                        total={stats.totalGames}
                        maxCount={maxCategoryCount}
                      />
                    )}
                  </div>
                )}
              </section>

              {/* Count by Number of Players */}
              <section
                aria-labelledby="stats-by-players-heading"
                className="rounded-xl border bg-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2
                    id="stats-by-players-heading"
                    className="text-base font-display font-semibold flex items-center gap-2"
                  >
                    <Users2 size={16} className="text-primary" />
                    Games by Number of Players
                  </h2>
                  <span className="text-xs text-muted-foreground">Supported player counts</span>
                </div>
                <div className="space-y-3">
                  {stats.playerCounts.map(({ label, count }) => (
                    <BarRow
                      key={label}
                      label={label}
                      count={count}
                      total={stats.totalGames}
                      maxCount={maxPlayerCount}
                    />
                  ))}
                </div>
              </section>

              {/* Count by Play Time */}
              <section
                aria-labelledby="stats-by-playtime-heading"
                className="rounded-xl border bg-card p-5 space-y-4"
              >
                <h2
                  id="stats-by-playtime-heading"
                  className="text-base font-display font-semibold flex items-center gap-2"
                >
                  <Clock size={16} className="text-primary" />
                  Games by Play Time
                </h2>
                <div className="space-y-3">
                  {stats.playTimeBuckets.map(({ label, count }) => (
                    <BarRow
                      key={label}
                      label={label}
                      count={count}
                      total={stats.totalGames}
                      maxCount={maxPlayTimeCount}
                    />
                  ))}
                </div>
              </section>

              {/* Count by Complexity (Weight) */}
              <section
                aria-labelledby="stats-by-weight-heading"
                className="rounded-xl border bg-card p-5 space-y-4"
              >
                <h2
                  id="stats-by-weight-heading"
                  className="text-base font-display font-semibold flex items-center gap-2"
                >
                  <Gauge size={16} className="text-primary" />
                  Games by Complexity (Weight)
                </h2>
                <div className="space-y-3">
                  {stats.weightBuckets.map(({ label, count }) => (
                    <BarRow
                      key={label}
                      label={label}
                      count={count}
                      total={stats.totalGames}
                      maxCount={maxWeightCount}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
