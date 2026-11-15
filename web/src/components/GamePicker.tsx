import { Dices } from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { useGameStats } from "../hooks/useGameStats.ts";
import { useGames } from "../hooks/useGames";
import type { Game } from "../lib/types";
import { idFromPk } from "../lib/utils";
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

export type SortKey =
  | "name-asc"
  | "name-desc"
  | "added-desc"
  | "added-asc"
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

export function sortGames(games: Game[], key: SortKey): Game[] {
  return [...games].sort((a, b) => {
    switch (key) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "added-desc":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.name.localeCompare(b.name);
      case "added-asc":
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name);
      case "weight-asc":
        return (a.weight ?? 0) - (b.weight ?? 0);
      case "weight-desc":
        return (b.weight ?? 0) - (a.weight ?? 0);
      case "time-asc":
        return (a.playTime ?? 0) - (b.playTime ?? 0);
      case "time-desc":
        return (b.playTime ?? 0) - (a.playTime ?? 0);
      case "year-desc":
        return (b.yearPublished ?? 0) - (a.yearPublished ?? 0);
      case "year-asc":
        return (a.yearPublished ?? 0) - (b.yearPublished ?? 0);
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
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const isStale = debouncedSearch !== deferredSearch;
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const newGamePks = useMemo(() => getNewGamePks(games), [games]);

  const visible = useMemo(() => {
    let g = applyFilters(games, filters);
    if (deferredSearch.trim())
      g = g.filter((game) => game.name.toLowerCase().includes(deferredSearch.toLowerCase()));
    return sortGames(g, sort);
  }, [games, filters, deferredSearch, sort]);

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
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 px-2 text-sm rounded-md border border-input bg-background flex-1 sm:flex-none"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="added-desc">Added: Newest</option>
            <option value="added-asc">Added: Oldest</option>
            <option value="weight-asc">Weight: Light → Heavy</option>
            <option value="weight-desc">Weight: Heavy → Light</option>
            <option value="time-asc">Play Time: Short → Long</option>
            <option value="time-desc">Play Time: Long → Short</option>
            <option value="year-desc">Year: Newest</option>
            <option value="year-asc">Year: Oldest</option>
          </select>
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
