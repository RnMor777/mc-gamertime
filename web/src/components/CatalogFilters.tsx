import { Sparkles, Star } from "lucide-react";
import { useState } from "react";
import type { Game } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DualRangeSlider } from "./ui/dual-range-slider";

export const NEW_GAME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_NEW_GAMES = 5;

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
  yearPublished: [number, number];
  tags: string[];
  favorites: boolean;
  newlyAdded?: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  playerCount: [1, 10],
  playTime: [0, 300],
  weight: [0, 5],
  yearPublished: [1900, 2026],
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
  const allTags = Array.from(new Set(games.flatMap((g) => g.tags))).sort();
  const activeCount = [
    filters.playerCount[0] !== 1 || filters.playerCount[1] !== 10,
    filters.playTime[0] !== 0 || filters.playTime[1] !== 300,
    filters.weight[0] !== 0 || filters.weight[1] !== 5,
    filters.yearPublished[0] !== DEFAULT_FILTERS.yearPublished[0] ||
      filters.yearPublished[1] !== DEFAULT_FILTERS.yearPublished[1],
    filters.tags.length > 0,
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
              Weight: {filters.weight[0].toFixed(1)}–{filters.weight[1].toFixed(1)}
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
            <label className="text-sm font-medium mb-1 block">
              Year: {filters.yearPublished[0].toFixed(0)}–{filters.yearPublished[1].toFixed(0)}
            </label>
            <DualRangeSlider
              min={DEFAULT_FILTERS.yearPublished[0]}
              max={DEFAULT_FILTERS.yearPublished[1]}
              value={filters.yearPublished}
              onChange={(v) => onChange({ ...filters, yearPublished: v })}
            />
          </div>
          {allTags.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Tags</label>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      const next = filters.tags.includes(tag)
                        ? filters.tags.filter((t) => t !== tag)
                        : [...filters.tags, tag];
                      onChange({ ...filters, tags: next });
                    }}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      filters.tags.includes(tag)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {tag}
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
): Game[] {
  const newPks = filters.newlyAdded ? getNewGamePks(games, nowMs) : null;
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
    if (
      filters.yearPublished[0] !== DEFAULT_FILTERS.yearPublished[0] ||
      filters.yearPublished[1] !== DEFAULT_FILTERS.yearPublished[1]
    ) {
      if (g.yearPublished == null) return false;
      if (g.yearPublished < filters.yearPublished[0] || g.yearPublished > filters.yearPublished[1])
        return false;
    }
    if (filters.tags.length > 0) {
      if (!filters.tags.every((t) => g.tags.includes(t))) return false;
    }
    if (filters.favorites && !g.isFavorited) return false;
    if (newPks && !newPks.has(g.pk)) return false;
    return true;
  });
}
