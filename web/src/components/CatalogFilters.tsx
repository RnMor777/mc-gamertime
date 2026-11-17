import { Sparkles, Star } from "lucide-react";
import { useState } from "react";
import type { Game } from "../lib/types";
import { idFromPk } from "../lib/utils";
import { getGameCategories } from "./CategorySelect";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DualRangeSlider } from "./ui/dual-range-slider";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEW_GAME_WINDOW_MS = 7 * DAY_MS;
export const MAX_NEW_GAMES = 5;

export type LastPlayedFilter = "any" | "never" | "30d+" | "90d+" | "1y+" | "recent-30d";

export const LAST_PLAYED_OPTIONS: LastPlayedFilter[] = [
  "any",
  "never",
  "30d+",
  "90d+",
  "1y+",
  "recent-30d",
];

export const LAST_PLAYED_LABELS: Record<LastPlayedFilter, string> = {
  any: "Any",
  never: "Never played",
  "30d+": "30+ days ago",
  "90d+": "90+ days ago",
  "1y+": "1+ year ago",
  "recent-30d": "Last 30 days",
};

export function matchesLastPlayedFilter(
  game: Game,
  filter: LastPlayedFilter | undefined,
  lastPlayedDates: Record<string, string> = {},
  nowMs: number = Date.now(),
): boolean {
  if (!filter || filter === "any") return true;
  const dateStr = lastPlayedDates[idFromPk(game.pk)] ?? lastPlayedDates[game.pk];
  if (filter === "never") return !dateStr;
  if (filter === "recent-30d") {
    if (!dateStr) return false;
    const parsed = Date.parse(dateStr);
    return !Number.isNaN(parsed) && nowMs - parsed <= 30 * DAY_MS;
  }
  if (!dateStr) return true;
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return true;
  const ageMs = nowMs - parsed;
  if (filter === "30d+") return ageMs >= 30 * DAY_MS;
  if (filter === "90d+") return ageMs >= 90 * DAY_MS;
  if (filter === "1y+") return ageMs >= 365 * DAY_MS;
  return true;
}

export function getNewGamePks(games: Game[], nowMs: number = Date.now()): Set<string> {
  const cutoff = nowMs - NEW_GAME_WINDOW_MS;
  const newestFive = [...games]
    .filter((g) => Boolean(g.createdAt) && !Number.isNaN(Date.parse(g.createdAt)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_NEW_GAMES)
    .filter((g) => Date.parse(g.createdAt) >= cutoff);
  return new Set(newestFive.map((g) => g.pk));
}

export interface FilterState {
  playerCount: [number, number];
  playTime: [number, number];
  weight: [number, number];
  lastPlayed?: LastPlayedFilter;
  categories?: string[];
  tags: string[];
  favorites: boolean;
  newlyAdded?: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  playerCount: [1, 10],
  playTime: [0, 300],
  weight: [0, 5],
  lastPlayed: "any",
  categories: [],
  tags: [],
  favorites: false,
  newlyAdded: false,
};

interface Props {
  games: Game[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

export function CatalogFilters({ games, filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const allCategories = Array.from(new Set(games.flatMap((g) => getGameCategories(g)))).sort();
  const selectedCategories =
    filters.categories && filters.categories.length > 0 ? filters.categories : filters.tags;
  const currentLastPlayed = filters.lastPlayed ?? "any";
  const activeCount = [
    filters.playerCount[0] !== 1 || filters.playerCount[1] !== 10,
    filters.playTime[0] !== 0 || filters.playTime[1] !== 300,
    filters.weight[0] !== 0 || filters.weight[1] !== 5,
    currentLastPlayed !== "any",
    selectedCategories.length > 0,
    filters.favorites,
    Boolean(filters.newlyAdded),
  ].filter(Boolean).length;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          Filters {activeCount > 0 && <Badge className="ml-1">{activeCount}</Badge>}
        </Button>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 p-4 rounded-lg border bg-card space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filters.favorites ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ ...filters, favorites: !filters.favorites })}
              className="flex items-center gap-1.5"
            >
              <Star size={13} className={filters.favorites ? "fill-current" : ""} />
              Favorites only
            </Button>
            <Button
              variant={filters.newlyAdded ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ ...filters, newlyAdded: !filters.newlyAdded })}
              className="flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              Newly added
            </Button>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Player count: {filters.playerCount[0]}–{filters.playerCount[1]}
            </label>
            <DualRangeSlider
              min={1}
              max={10}
              value={filters.playerCount}
              onChange={(v) => onChange({ ...filters, playerCount: v })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Play time: {filters.playTime[0]}–
              {filters.playTime[1] >= 300 ? "300+" : filters.playTime[1]} min
            </label>
            <DualRangeSlider
              min={0}
              max={300}
              step={15}
              value={filters.playTime}
              onChange={(v) => onChange({ ...filters, playTime: v })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Complexity: {filters.weight[0].toFixed(1)}–{filters.weight[1].toFixed(1)}
            </label>
            <DualRangeSlider
              min={0}
              max={5}
              step={0.5}
              value={filters.weight}
              onChange={(v) => onChange({ ...filters, weight: v })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Last played</label>
            <div className="flex flex-wrap gap-2">
              {LAST_PLAYED_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={currentLastPlayed === opt}
                  onClick={() => onChange({ ...filters, lastPlayed: opt })}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                    currentLastPlayed === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary"
                  }`}
                >
                  {LAST_PLAYED_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
          {allCategories.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Categories</label>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      const next = selectedCategories.includes(category)
                        ? selectedCategories.filter((c) => c !== category)
                        : [...selectedCategories, category];
                      onChange({ ...filters, categories: next, tags: next });
                    }}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      selectedCategories.includes(category)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function applyFilters(
  games: Game[],
  filters: FilterState,
  nowMs: number = Date.now(),
  lastPlayedDates: Record<string, string> = {},
): Game[] {
  const newPks = filters.newlyAdded ? getNewGamePks(games, nowMs) : null;
  const selectedCategories =
    filters.categories && filters.categories.length > 0 ? filters.categories : filters.tags;
  return games.filter((g) => {
    if (filters.playerCount[0] !== 1 || filters.playerCount[1] !== 10) {
      if (g.minPlayers == null || g.maxPlayers == null) return false;
      if (g.maxPlayers < filters.playerCount[0] || g.minPlayers > filters.playerCount[1])
        return false;
    }
    if (filters.playTime[0] !== 0 || filters.playTime[1] !== 300) {
      if (g.playTime == null) return false;
      if (g.playTime < filters.playTime[0] || g.playTime > filters.playTime[1]) return false;
    }
    if (filters.weight[0] !== 0 || filters.weight[1] !== 5) {
      if (g.weight == null) return false;
      if (g.weight < filters.weight[0] || g.weight > filters.weight[1]) return false;
    }
    if (!matchesLastPlayedFilter(g, filters.lastPlayed, lastPlayedDates, nowMs)) {
      return false;
    }
    if (selectedCategories.length > 0) {
      const gameCategories = getGameCategories(g);
      if (!selectedCategories.every((c) => gameCategories.includes(c))) return false;
    }
    if (filters.favorites && !g.isFavorited) return false;
    if (newPks && !newPks.has(g.pk)) return false;
    return true;
  });
}
