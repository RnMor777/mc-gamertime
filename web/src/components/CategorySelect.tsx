import { Check, Plus, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Game } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/**
 * Standard BoardGameGeek `boardgamecategory` values.
 */
export const BGG_BOARDGAME_CATEGORIES: readonly string[] = [
  "Abstract Strategy",
  "Action / Dexterity",
  "Adventure",
  "Age of Reason",
  "American West",
  "Ancient",
  "Animals",
  "Arabian",
  "Aviation / Flight",
  "Bluffing",
  "Book",
  "Card Game",
  "Children's Game",
  "City Building",
  "Civil War",
  "Civilization",
  "Collectible Components",
  "Comic Book / Strip",
  "Deduction",
  "Dice",
  "Economic",
  "Educational",
  "Electronic",
  "Environmental",
  "Expansion for Base-game",
  "Exploration",
  "Fantasy",
  "Farming",
  "Fighting",
  "Game System",
  "Horror",
  "Humor",
  "Industry / Manufacturing",
  "Mafia",
  "Math",
  "Mature / Adult",
  "Maze",
  "Medical",
  "Medieval",
  "Memory",
  "Miniatures",
  "Modern Warfare",
  "Movies / TV / Radio theme",
  "Murder / Mystery",
  "Music",
  "Mythology",
  "Napoleonic",
  "Nautical",
  "Negotiation",
  "Novel-based",
  "Number",
  "Party Game",
  "Pike and Shot",
  "Pirates",
  "Political",
  "Post-Napoleonic",
  "Prehistoric",
  "Print & Play",
  "Puzzle",
  "Racing",
  "Real-time",
  "Religious",
  "Renaissance",
  "Science Fiction",
  "Space Exploration",
  "Spies / Secret Agents",
  "Sports",
  "Territory Building",
  "Trains",
  "Transportation",
  "Travel",
  "Trivia",
  "Video Game Theme",
  "Vietnam War",
  "Wargame",
  "Word Game",
  "World War I",
  "World War II",
  "Zombies",
];

export function getGameCategories(game: Pick<Game, "categories" | "tags">): string[] {
  const raw = game.categories && game.categories.length > 0 ? game.categories : (game.tags ?? []);
  const seen: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (trimmed && !seen.includes(trimmed)) {
      seen.push(trimmed);
    }
  }
  return seen;
}

interface CategorySelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
}

export function CategorySelect({ value, onChange, label = "Categories" }: CategorySelectProps) {
  const [filterText, setFilterText] = useState("");
  const [showAllBgg, setShowAllBgg] = useState(false);

  const addCategoriesFromText = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const part of parts) {
      const canonical =
        BGG_BOARDGAME_CATEGORIES.find((c) => c.toLowerCase() === part.toLowerCase()) ?? part;
      if (!next.some((c) => c.toLowerCase() === canonical.toLowerCase())) {
        next.push(canonical);
      }
    }
    onChange(next);
    setFilterText("");
  };

  const toggleCategory = (cat: string) => {
    const exists = value.some((c) => c.toLowerCase() === cat.toLowerCase());
    if (exists) {
      onChange(value.filter((c) => c.toLowerCase() !== cat.toLowerCase()));
    } else {
      onChange([...value, cat]);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const list = q
      ? BGG_BOARDGAME_CATEGORIES.filter((c) => c.toLowerCase().includes(q))
      : BGG_BOARDGAME_CATEGORIES;
    return showAllBgg || q ? list : list.slice(0, 14);
  }, [filterText, showAllBgg]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Tag size={13} className="text-primary" />
          {label}
        </label>
        {value.length > 0 && (
          <span className="text-xs text-muted-foreground">{value.length} selected</span>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((cat) => (
            <Badge
              key={cat}
              variant="secondary"
              className="flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 text-xs"
            >
              <span>{cat}</span>
              <button
                type="button"
                aria-label={`Remove category ${cat}`}
                onClick={() => toggleCategory(cat)}
                className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCategoriesFromText(filterText);
            }
          }}
          placeholder="Search BGG categories or type custom (comma-separated)…"
        />
        {filterText.trim() && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addCategoriesFromText(filterText)}
            className="shrink-0 gap-1"
          >
            <Plus size={14} />
            Add
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-muted/20 p-2">
        <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center justify-between">
          <span>BGG BoardGame Categories</span>
          {!filterText.trim() && (
            <button
              type="button"
              onClick={() => setShowAllBgg((s) => !s)}
              className="text-primary hover:underline"
            >
              {showAllBgg ? "Show fewer" : `Show all (${BGG_BOARDGAME_CATEGORIES.length})`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
          {filteredSuggestions.map((cat) => {
            const selected = value.some((c) => c.toLowerCase() === cat.toLowerCase());
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                {selected && <Check size={10} />}
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
