import { ArrowDown, ArrowUp, Dices } from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { useGameStats } from "../hooks/useGameStats.ts";
import { useGames } from "../hooks/useGames";
import type { Game } from "../lib/types";
import { gameMatchesSearch, idFromPk } from "../lib/utils";
import {
  applyFilters,
  CatalogFilters,
  DEFAULT_FILTERS,
  type FilterState,
  getNewGamePks,
} from "./CatalogFilters";
import { GameCard } from "./GameCard";
import { GameCardSkeleton } from "./GameCardSkeleton.tsx";
import { GameListRow } from "./GameListRow";
import { Input } from "./ui/input";

export type SortField = "name" | "added" | "lastPlayed" | "complexity" | "time" | "year";
export type SortDirection = "asc" | "desc";

export type SortKey =
  | SortField
  | "name-asc"
  | "name-desc"
  | "added-desc"
  | "added-asc"
  | "lastPlayed-desc"
  | "lastPlayed-asc"
  | "complexity-asc"
  | "complexity-desc"
  | "weight-asc"
  | "weight-desc"
  | "time-asc"
  | "time-desc"
  | "year-desc"
  | "year-asc";

interface Props {
  onSelect?: (game: Game) => void;
  onDelete?: (id: string) => void;
}

function resolveSortFieldAndDir(
  key: SortKey,
  direction?: SortDirection,
): { field: SortField; dir: SortDirection } {
  if (key.endsWith("-asc")) {
    const raw = key.slice(0, -4);
    return {
      field: (raw === "weight" ? "complexity" : raw) as SortField,
      dir: "asc",
    };
  }
  if (key.endsWith("-desc")) {
    const raw = key.slice(0, -5);
    return {
      field: (raw === "weight" ? "complexity" : raw) as SortField,
      dir: "desc",
    };
  }
  return { field: key as SortField, dir: direction ?? "asc" };
}

export function sortGames(
  games: Game[],
  key: SortKey,
  direction?: SortDirection,
  lastPlayedDates: Record<string, string> = {},
): Game[] {
  const { field, dir } = resolveSortFieldAndDir(key, direction);
  const mult = dir === "asc" ? 1 : -1;

  return [...games].sort((a, b) => {
    switch (field) {
      case "name":
        return mult * a.name.localeCompare(b.name);
      case "added":
        return (
          mult * (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
          a.name.localeCompare(b.name)
        );
      case "lastPlayed": {
        const aDate = lastPlayedDates[idFromPk(a.pk)] ?? lastPlayedDates[a.pk] ?? "";
        const bDate = lastPlayedDates[idFromPk(b.pk)] ?? lastPlayedDates[b.pk] ?? "";
        if (!aDate && !bDate) return a.name.localeCompare(b.name);
        if (!aDate) return dir === "desc" ? 1 : -1;
        if (!bDate) return dir === "desc" ? -1 : 1;
        return mult * aDate.localeCompare(bDate) || a.name.localeCompare(b.name);
      }
      case "complexity":
        return mult * ((a.weight ?? 0) - (b.weight ?? 0)) || a.name.localeCompare(b.name);
      case "time":
        return mult * ((a.playTime ?? 0) - (b.playTime ?? 0)) || a.name.localeCompare(b.name);
      case "year":
        return (
          mult * ((a.yearPublished ?? 0) - (b.yearPublished ?? 0)) || a.name.localeCompare(b.name)
        );
      default:
        return 0;
    }
  });
}

export function GamePicker({ onSelect, onDelete }: Props) {
  const { data: games = [], isLoading } = useGames();
  const { playCounts, lastPlayedDates } = useGameStats();
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("catalog-view") as "grid" | "list") ?? "grid",
  );
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const isStale = debouncedSearch !== deferredSearch;
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const newGamePks = useMemo(() => getNewGamePks(games), [games]);

  const visible = useMemo(() => {
    let g = applyFilters(games, filters, undefined, lastPlayedDates);
    if (deferredSearch.trim()) g = g.filter((game) => gameMatchesSearch(game, deferredSearch));
    return sortGames(g, sortField, sortDir, lastPlayedDates);
  }, [games, filters, deferredSearch, sortField, sortDir, lastPlayedDates]);

  const handleDelete = useCallback(
    (id: string) => {
      if (onDelete) onDelete(id);
    },
    [onDelete],
  );

  if (isLoading)
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <GameCardSkeleton key={i} />
        ))}
      </div>
    );

  return (
    <div>
      <div className="space-y-2 mb-4">
        <Input
          aria-label="Search games"
          placeholder="Search games…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full sm:w-64 text-sm"
        />
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort games"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="h-8 px-2 text-sm rounded-md border border-input bg-background flex-1 sm:flex-none"
          >
            <option value="name">Name</option>
            <option value="added">Added</option>
            <option value="lastPlayed">Last Played</option>
            <option value="complexity">Complexity</option>
            <option value="time">Play Time</option>
            <option value="year">Year</option>
          </select>
          <button
            type="button"
            aria-label={`Sort direction: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="h-8 px-2.5 text-sm rounded-md border border-input bg-background hover:bg-muted flex items-center gap-1 text-foreground transition-colors"
          >
            {sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            <span className="text-xs">{sortDir === "asc" ? "Asc" : "Desc"}</span>
          </button>
          <div className="flex rounded-md border border-input overflow-hidden ml-auto">
            <button
              onClick={() => {
                setView("grid");
                localStorage.setItem("catalog-view", "grid");
              }}
              className={`px-2 py-1 text-sm ${view === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
              title="Grid"
            >
              ⊞
            </button>
            <button
              onClick={() => {
                setView("list");
                localStorage.setItem("catalog-view", "list");
              }}
              className={`px-2 py-1 text-sm ${view === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
              title="List"
            >
              ☰
            </button>
          </div>
        </div>
      </div>
      <CatalogFilters games={games} filters={filters} onChange={setFilters} />

      {visible.length < games.length && !isLoading && (
        <p className="text-sm text-muted-foreground mb-2">
          Matching: {visible.length}/{games.length}
        </p>
      )}

      {visible.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Dices
            size={52}
            className="opacity-20 animate-spin"
            style={{ animationDuration: "4s" }}
          />
          <p className="font-display font-semibold text-foreground text-lg">No games match</p>
          <p className="text-sm">Try adjusting the filters or search term.</p>
        </div>
      )}
      {view === "grid" ? (
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 transition-opacity duration-150 ${isStale ? "opacity-60" : ""}`}
        >
          {visible.map((game) => (
            <div
              key={game.pk}
              onClick={onSelect ? () => onSelect(game) : undefined}
              className={onSelect ? "cursor-pointer" : ""}
            >
              <GameCard
                game={game}
                handleDelete={handleDelete}
                playCounts={playCounts[idFromPk(game.pk)]}
                lastPlayed={lastPlayedDates[idFromPk(game.pk)]}
                isNew={newGamePks.has(game.pk)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((game) => (
            <GameListRow
              key={game.pk}
              game={game}
              onSelect={onSelect}
              onDelete={handleDelete}
              isNew={newGamePks.has(game.pk)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
