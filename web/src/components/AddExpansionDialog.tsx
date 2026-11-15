import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useGameImageUpload } from "../hooks/useGameImageUpload";
import { useAddGameExpansion } from "../hooks/useGames";
import { getBggDetail, searchBggExpansions } from "../lib/api";
import type { BggGameDetail, BggSearchResult, Game } from "../lib/types";
import { idFromPk } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

interface Props {
  open: boolean;
  onClose: () => void;
  game: Game;
}

export function AddExpansionDialog({ open, onClose, game }: Props) {
  const addExpansion = useAddGameExpansion();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BggSearchResult[]>([]);
  const [selected, setSelected] = useState<BggGameDetail | null>(null);
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [manualName, setManualName] = useState("");
  const [description, setDescription] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [playTime, setPlayTime] = useState("");
  const [weight, setWeight] = useState("");
  const [yearPublished, setYearPublished] = useState("");
  const {
    imageUrl: manualImageUrl,
    uploading,
    handleFileChange,
    setImageUrl: setManualImageUrl,
  } = useGameImageUpload();

  const existingBggIds = new Set(
    (game.expansions ?? []).map((e) => e.bggId).filter((id): id is number => id != null),
  );

  const runSearch = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setSearching(true);
    setResults([]);
    setSelected(null);
    try {
      setResults(await searchBggExpansions(trimmed));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (open && game.name.trim()) {
      setQuery(game.name);
      void runSearch(game.name);
    }
  }, [open, game.name, runSearch]);

  const handleSearch = async () => {
    await runSearch(query);
  };

  const handleAutoSearchBaseGame = async () => {
    setQuery(game.name);
    await runSearch(game.name);
  };

  const handleSelect = async (r: BggSearchResult) => {
    setSelected(null);
    setSearching(true);
    try {
      const detail = await getBggDetail(r.bggId);
      setSelected({ ...detail, name: r.name || detail.name });
    } finally {
      setSearching(false);
    }
  };

  const handleSaveSelected = async () => {
    if (!selected) return;
    await addExpansion.mutateAsync({
      gameId: idFromPk(game.pk),
      expansion: {
        name: selected.name,
        bggId: selected.bggId,
        description: selected.description,
        imageUrl: selected.imageUrl,
        minPlayers: selected.minPlayers,
        maxPlayers: selected.maxPlayers,
        playTime: selected.playTime,
        weight: selected.weight,
        yearPublished: selected.yearPublished,
      },
    });
    handleClose();
  };

  const handleManualSave = async () => {
    if (!manualName.trim()) return;
    await addExpansion.mutateAsync({
      gameId: idFromPk(game.pk),
      expansion: {
        name: manualName.trim(),
        description: description.trim() || undefined,
        imageUrl: manualImageUrl,
        minPlayers: minPlayers ? Number(minPlayers) : undefined,
        maxPlayers: maxPlayers ? Number(maxPlayers) : undefined,
        playTime: playTime ? Number(playTime) : undefined,
        weight: weight ? Number(weight) : undefined,
        yearPublished: yearPublished ? Number(yearPublished) : undefined,
      },
    });
    handleClose();
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setMode("search");
    setManualName("");
    setDescription("");
    setMinPlayers("");
    setMaxPlayers("");
    setPlayTime("");
    setWeight("");
    setYearPublished("");
    setManualImageUrl(undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title={`Add Expansion — ${game.name}`}>
      <div className="flex gap-2 mb-3 text-sm">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={mode === "search" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Search BGG
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={mode === "manual" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Manual entry
        </button>
      </div>

      {mode === "manual" ? (
        <div className="space-y-3">
          {manualImageUrl && (
            <img
              src={manualImageUrl}
              alt={manualName}
              className="w-full h-44 object-cover rounded-sm"
            />
          )}
          <div>
            <label className="text-sm font-medium">Cover image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              onChange={handleFileChange}
              disabled={uploading}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="manual-expansion-name">
              Expansion name
            </label>
            <Input
              id="manual-expansion-name"
              className="mt-1"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder={`${game.name}: Expansion…`}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="manual-expansion-description">
              Description (optional)
            </label>
            <textarea
              id="manual-expansion-description"
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the expansion…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min players"
              value={minPlayers}
              onChange={(e) => setMinPlayers(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max players"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Play time (min)"
              value={playTime}
              onChange={(e) => setPlayTime(e.target.value)}
            />
            <Input
              type="number"
              step="0.1"
              placeholder="Weight"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <Input
            type="number"
            placeholder="Year published"
            value={yearPublished}
            onChange={(e) => setYearPublished(e.target.value)}
          />
          <Button
            className="w-full"
            isLoading={addExpansion.isPending}
            disabled={!manualName.trim() || uploading}
            onClick={handleManualSave}
          >
            Add Expansion
          </Button>
        </div>
      ) : !selected ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search BGG expansions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching}>
              Search
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Searching BoardGameGeek expansions</span>
            <button
              type="button"
              onClick={handleAutoSearchBaseGame}
              disabled={searching}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Sparkles size={12} />
              Find for {game.name}
            </button>
          </div>
          {searching && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          )}
          {!searching && results.length === 0 && query.trim() && (
            <p className="text-sm text-muted-foreground py-3 text-center">
              No expansions found on BGG for "{query.trim()}". Try another search or use manual
              entry.
            </p>
          )}
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {results.map((r) => {
              const alreadyAdded = existingBggIds.has(r.bggId);
              return (
                <li key={r.bggId}>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-3 py-2 rounded-sm hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent transition-colors text-sm flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-medium">{r.name}</span>
                      {r.yearPublished && (
                        <span className="text-muted-foreground ml-2">({r.yearPublished})</span>
                      )}
                    </div>
                    {alreadyAdded && (
                      <span className="text-xs text-muted-foreground shrink-0">Added</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          {selected.imageUrl && (
            <img
              src={selected.imageUrl}
              alt={selected.name}
              className="w-full h-44 object-cover rounded-sm"
            />
          )}
          <div>
            <h3 className="font-bold text-base">
              {selected.name}
              {selected.yearPublished ? ` (${selected.yearPublished})` : ""}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {[
                selected.minPlayers != null && selected.maxPlayers != null
                  ? `${selected.minPlayers}–${selected.maxPlayers} players`
                  : null,
                selected.playTime != null ? `${selected.playTime} min` : null,
                selected.weight != null ? `Weight ${selected.weight.toFixed(1)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {selected.description && (
            <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
              {selected.description}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>
              ← Back
            </Button>
            <Button
              onClick={handleSaveSelected}
              isLoading={addExpansion.isPending}
              className="flex-1"
            >
              Add Expansion
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
