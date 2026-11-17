import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useGameImageUpload } from "../hooks/useGameImageUpload";
import { useUpdateGame } from "../hooks/useGames";
import type { Game } from "../lib/types";
import { idFromPk } from "../lib/utils";
import { CategorySelect, getGameCategories } from "./CategorySelect";
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
  const [categories, setCategories] = useState<string[]>([]);
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
    setCategories(getGameCategories(game));
    setImageUrl(game.imageUrl);
    setError("");
  }, [open, game, setImageUrl]);

  const handleSave = async () => {
    const playerVariables = [];
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
      playerVariables.push({ label, options });
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    await updateGame.mutateAsync({
      id: idFromPk(game.pk),
      data: {
        name: name.trim(),
        description: description.trim(),
        imageUrl: imageUrl ?? null,
        minPlayers: minPlayers ? Number(minPlayers) : null,
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        playTime: playTime ? Number(playTime) : null,
        weight: weight ? Number(weight) : null,
        yearPublished: yearPublished ? Number(yearPublished) : null,
        categories,
        tags: categories,
        playerVariables,
        trackTurnOrder,
      },
    });
    onClose();
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
          <label className="text-sm font-medium" htmlFor="configure-game-name">
            Name
          </label>
          <Input
            id="configure-game-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="configure-game-description">
            Description
          </label>
          <textarea
            id="configure-game-description"
            className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the game…"
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
            placeholder="Complexity"
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
        <CategorySelect value={categories} onChange={setCategories} />
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
          isLoading={updateGame.isPending}
          disabled={uploading}
          onClick={handleSave}
        >
          Save configuration
        </Button>
      </div>
    </Dialog>
  );
}
