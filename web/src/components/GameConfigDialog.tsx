import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useGameImageUpload } from "../hooks/useGameImageUpload";
import { useUpdateGame } from "../hooks/useGames";
import { getGameRulebookUploadUrl } from "../lib/api";
import type { Game, GameRulebook } from "../lib/types";
import { idFromPk } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

interface VariableRow {
  label: string;
  optionsText: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  game: Game;
}

export function GameConfigDialog({ open, onClose, game }: Props) {
  const updateGame = useUpdateGame();
  const [variables, setVariables] = useState<VariableRow[]>([]);
  const [trackTurnOrder, setTrackTurnOrder] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [playTime, setPlayTime] = useState("");
  const [weight, setWeight] = useState("");
  const [yearPublished, setYearPublished] = useState("");
  const [tags, setTags] = useState("");
  const [rulebooks, setRulebooks] = useState<GameRulebook[]>([]);
  const [uploadingRulebook, setUploadingRulebook] = useState(false);
  const { imageUrl, uploading, handleFileChange, setImageUrl } = useGameImageUpload(game.imageUrl);

  useEffect(() => {
    if (!open) return;
    setVariables(
      (game.playerVariables ?? []).map((v) => ({
        label: v.label,
        optionsText: v.options.join(", "),
      })),
    );
    setTrackTurnOrder(game.trackTurnOrder ?? false);
    setName(game.name);
    setDescription(game.description ?? "");
    setMinPlayers(game.minPlayers?.toString() ?? "");
    setMaxPlayers(game.maxPlayers?.toString() ?? "");
    setPlayTime(game.playTime?.toString() ?? "");
    setWeight(game.weight?.toString() ?? "");
    setYearPublished(game.yearPublished?.toString() ?? "");
    setTags(game.tags.join(", "));
    setRulebooks(game.rulebooks ?? []);
    setImageUrl(game.imageUrl);
    setError("");
  }, [open, game, setImageUrl]);

  const persistGame = async (nextRulebooks: GameRulebook[]) => {
    await updateGame.mutateAsync({
      id: idFromPk(game.pk),
      data: {
        name: name.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl ?? null,
        minPlayers: minPlayers ? Number(minPlayers) : null,
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        playTime: playTime ? Number(playTime) : null,
        weight: weight ? Number(weight) : null,
        yearPublished: yearPublished ? Number(yearPublished) : null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        playerVariables: variables.map((v) => ({
          label: v.label.trim(),
          options: v.optionsText
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        })),
        trackTurnOrder,
        rulebooks: nextRulebooks,
      },
    });
  };

  const handleSave = async () => {
    for (const v of variables) {
      const label = v.label.trim();
      const options = v.optionsText
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      if (!label) {
        setError("Each variable needs a label");
        return;
      }
      if (options.length < 2) {
        setError(`"${label}" needs at least 2 options`);
        return;
      }
      if (new Set(options).size !== options.length) {
        setError(`"${label}" has duplicate options`);
        return;
      }
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    await persistGame(rulebooks);
    onClose();
  };

  const handleRulebookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF rule books are supported");
      e.target.value = "";
      return;
    }

    setUploadingRulebook(true);
    try {
      const { uploadUrl, rulebookUrl } = await getGameRulebookUploadUrl(
        idFromPk(game.pk),
        file.name,
        file.type,
      );
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const nextRulebooks = [
        ...rulebooks,
        {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          filename: file.name,
          url: rulebookUrl,
          uploadedAt: new Date().toISOString(),
        },
      ];
      setRulebooks(nextRulebooks);
      await persistGame(nextRulebooks);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Rule book upload failed");
    } finally {
      setUploadingRulebook(false);
      e.target.value = "";
    }
  };

  const handleDeleteRulebook = async (rulebookId: string) => {
    const nextRulebooks = rulebooks.filter((r) => r.id !== rulebookId);
    setRulebooks(nextRulebooks);
    try {
      await persistGame(nextRulebooks);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to remove rule book");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Configure ${game.name}`}>
      <div className="space-y-4">
        {imageUrl && (
          <img src={imageUrl} alt={name} className="w-full h-40 object-cover rounded-sm" />
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
          <label className="text-sm font-medium">Name</label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
        <div>
          <label className="text-sm font-medium">Tags (comma-separated)</label>
          <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Rule books</label>
          <div className="mt-2 space-y-2">
            {rulebooks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rule books uploaded yet.</p>
            ) : (
              rulebooks.map((rb) => (
                <div
                  key={rb.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm"
                >
                  <a href={rb.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline min-w-0">
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate">{rb.filename}</span>
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteRulebook(rb.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
              <Plus size={14} />
              Upload PDF rule book
              <input
                type="file"
                accept="application/pdf"
                onChange={handleRulebookUpload}
                disabled={uploadingRulebook}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Player variables</label>
          <p className="text-xs text-muted-foreground mt-0.5">
            e.g. "Color" with options "White, Black" — players pick one when logging a session.
          </p>
          <div className="mt-2 space-y-2">
            {variables.map((v, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  placeholder="Label (e.g. Color)"
                  value={v.label}
                  onChange={(e) =>
                    setVariables((vs) =>
                      vs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className="w-32"
                />
                <Input
                  placeholder="Options, comma-separated"
                  value={v.optionsText}
                  onChange={(e) =>
                    setVariables((vs) =>
                      vs.map((x, j) => (j === i ? { ...x, optionsText: e.target.value } : x)),
                    )
                  }
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => setVariables((vs) => [...vs, { label: "", optionsText: "" }])}
          >
            <Plus size={14} />
            Add variable
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={trackTurnOrder}
            onChange={(e) => setTrackTurnOrder(e.target.checked)}
          />
          Track turn order / seat position
        </label>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <Button
          className="w-full"
          isLoading={updateGame.isPending || uploadingRulebook}
          disabled={uploading}
          onClick={handleSave}
        >
          Save configuration
        </Button>
      </div>
    </Dialog>
  );
}
