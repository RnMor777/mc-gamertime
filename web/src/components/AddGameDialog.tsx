import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGameImageUpload } from "../hooks/useGameImageUpload";
import { addGame, getBggDetail, searchBgg } from "../lib/api";
import type { BggGameDetail, BggSearchResult } from "../lib/types";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddGameDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BggSearchResult[]>([]);
  const [selected, setSelected] = useState<BggGameDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState("");
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [manualName, setManualName] = useState("");
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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setSelected(null);
    try {
      setResults(await searchBgg(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (r: BggSearchResult) => {
    setSelected(null);
    setSearching(true);
    try {
      setSelected(await getBggDetail(r.bggId));
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await addGame({
        name: selected.name,
        description: selected.description,
        bggId: selected.bggId,
        imageUrl: selected.imageUrl,
        minPlayers: selected.minPlayers,
        maxPlayers: selected.maxPlayers,
        playTime: selected.playTime,
        weight: selected.weight,
        yearPublished: selected.yearPublished,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        rulebooks: [],
        createdAt: new Date().toISOString(),
        pk: "",
      });
      qc.invalidateQueries({ queryKey: ["games"] });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualName.trim()) return;
    setSaving(true);
    try {
      await addGame({
        name: manualName.trim(),
        description: undefined,
        imageUrl: manualImageUrl,
        minPlayers: minPlayers ? Number(minPlayers) : undefined,
        maxPlayers: maxPlayers ? Number(maxPlayers) : undefined,
        playTime: playTime ? Number(playTime) : undefined,
        weight: weight ? Number(weight) : undefined,
        yearPublished: yearPublished ? Number(yearPublished) : undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        rulebooks: [],
        createdAt: new Date().toISOString(),
        pk: "",
      });
      qc.invalidateQueries({ queryKey: ["games"] });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setTags("");
    setMode("search");
    setManualName("");
    setMinPlayers("");
    setMaxPlayers("");
    setPlayTime("");
    setWeight("");
    setYearPublished("");
    setManualImageUrl(undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Add Game">
      <div className="flex gap-2 mb-3 text-sm">
        <button
          onClick={() => setMode("search")}
          className={mode === "search" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Search BGG
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={() => setMode("manual")}
          className={mode === "manual" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Manual entry
        </button>
      </div>
      {mode === "manual" ? (
        <ManualGameForm
          name={manualName}
          onNameChange={setManualName}
          minPlayers={minPlayers}
          onMinPlayersChange={setMinPlayers}
          maxPlayers={maxPlayers}
          onMaxPlayersChange={setMaxPlayers}
          playTime={playTime}
          onPlayTimeChange={setPlayTime}
          weight={weight}
          onWeightChange={setWeight}
          yearPublished={yearPublished}
          onYearPublishedChange={setYearPublished}
          tags={tags}
          onTagsChange={setTags}
          imageUrl={manualImageUrl}
          uploading={uploading}
          onFileChange={handleFileChange}
          saving={saving}
          onSave={handleManualSave}
        />
      ) : !selected ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search BoardGameGeek…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching}>
              Search
            </Button>
          </div>
          {searching && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {results.map((r) => (
              <li key={r.bggId}>
                <button
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 rounded-sm hover:bg-accent transition-colors text-sm"
                >
                  <span className="font-medium">{r.name}</span>
                  {r.yearPublished && (
                    <span className="text-muted-foreground ml-2">({r.yearPublished})</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          {selected.imageUrl && (
            <img
              src={selected.imageUrl}
              alt={selected.name}
              className="w-full h-48 object-cover rounded-sm"
            />
          )}
          <h3 className="font-bold text-base">
            {selected.name} ({selected.yearPublished})
          </h3>
          {selected.description && (
            <p className="text-sm text-muted-foreground line-clamp-4">{selected.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {selected.minPlayers}–{selected.maxPlayers} players · {selected.playTime} min · Weight{" "}
            {selected.weight?.toFixed(1)}
          </p>
          <div>
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input
              className="mt-1"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="strategy, family, …"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>
              ← Back
            </Button>
            <Button onClick={handleSave} isLoading={saving} className="flex-1">
              Add to Catalog
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

interface ManualGameFormProps {
  name: string;
  onNameChange: (v: string) => void;
  minPlayers: string;
  onMinPlayersChange: (v: string) => void;
  maxPlayers: string;
  onMaxPlayersChange: (v: string) => void;
  playTime: string;
  onPlayTimeChange: (v: string) => void;
  weight: string;
  onWeightChange: (v: string) => void;
  yearPublished: string;
  onYearPublishedChange: (v: string) => void;
  tags: string;
  onTagsChange: (v: string) => void;
  imageUrl: string | undefined;
  uploading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saving: boolean;
  onSave: () => void;
}

function ManualGameForm({
  name,
  onNameChange,
  minPlayers,
  onMinPlayersChange,
  maxPlayers,
  onMaxPlayersChange,
  playTime,
  onPlayTimeChange,
  weight,
  onWeightChange,
  yearPublished,
  onYearPublishedChange,
  tags,
  onTagsChange,
  imageUrl,
  uploading,
  onFileChange,
  saving,
  onSave,
}: ManualGameFormProps) {
  return (
    <div className="space-y-3">
      {imageUrl && (
        <img src={imageUrl} alt={name} className="w-full h-48 object-cover rounded-sm" />
      )}
      <div>
        <label className="text-sm font-medium">Cover image</label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          onChange={onFileChange}
          disabled={uploading}
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input
          className="mt-1"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Game name"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder="Min players"
          value={minPlayers}
          onChange={(e) => onMinPlayersChange(e.target.value)}
        />
        <Input
          type="number"
          placeholder="Max players"
          value={maxPlayers}
          onChange={(e) => onMaxPlayersChange(e.target.value)}
        />
        <Input
          type="number"
          placeholder="Play time (min)"
          value={playTime}
          onChange={(e) => onPlayTimeChange(e.target.value)}
        />
        <Input
          type="number"
          step="0.1"
          placeholder="Weight"
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
        />
      </div>
      <Input
        type="number"
        placeholder="Year published"
        value={yearPublished}
        onChange={(e) => onYearPublishedChange(e.target.value)}
      />
      <div>
        <label className="text-sm font-medium">Tags (comma-separated)</label>
        <Input
          className="mt-1"
          value={tags}
          onChange={(e) => onTagsChange(e.target.value)}
          placeholder="strategy, family, …"
        />
      </div>
      <Button
        className="w-full"
        isLoading={saving}
        disabled={!name.trim() || uploading}
        onClick={onSave}
      >
        Add to Catalog
      </Button>
    </div>
  );
}
