import { Check, Dices, Search, Tag, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  LAST_PLAYED_LABELS,
  LAST_PLAYED_OPTIONS,
  type LastPlayedFilter,
  matchesLastPlayedFilter,
} from "../components/CatalogFilters";
import { getGameCategories } from "../components/CategorySelect";
import { GameCard } from "../components/GameCard";
import { LibraryBar } from "../components/LibraryBar";
import { PageTransition } from "../components/PageTransition";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useGameStats } from "../hooks/useGameStats";
import { useGames } from "../hooks/useGames";
import type { Game } from "../lib/types";
import { idFromPk } from "../lib/utils";

type PlayerFilter = "any" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
type TimeFilter = "any" | "30" | "60" | "90" | "120";
type WeightFilter = "any" | "light" | "medium" | "heavy";

const PLAYER_OPTIONS: PlayerFilter[] = ["any", "2", "3", "4", "5", "6", "7", "8"];
const PLAYER_LABELS: Record<PlayerFilter, string> = {
  any: "Any",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8+",
};

const WEIGHT_MAX: Record<WeightFilter, number | null> = {
  any: null,
  light: 2,
  medium: 3.5,
  heavy: 5,
};
const TIME_LABELS: Record<TimeFilter, string> = {
  any: "Any",
  "30": "≤30m",
  "60": "≤60m",
  "90": "≤90m",
  "120": "≤2h",
};
const WEIGHT_LABELS: Record<WeightFilter, string> = {
  any: "Any",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

function FilterButtons<T extends string>({
  label,
  options,
  value,
  labels,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(opt)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary scale-105 shadow-xs shadow-primary/20"
                  : "bg-background hover:bg-muted border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <span
                className={`overflow-hidden transition-all duration-200 ${isActive ? "w-3" : "w-0"}`}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              {labels[opt]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Picker() {
  const { data: games = [], isLoading } = useGames();
  const { playCounts, lastPlayedDates } = useGameStats();
  const [players, setPlayers] = useState<PlayerFilter>("any");
  const [maxTime, setMaxTime] = useState<TimeFilter>("any");
  const [maxWeight, setMaxWeight] = useState<WeightFilter>("any");
  const [lastPlayed, setLastPlayed] = useState<LastPlayedFilter>("any");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [picked, setPicked] = useState<Game | null>(null);
  const [rolling, setRolling] = useState(false);

  const allCategories = useMemo(
    () => Array.from(new Set(games.flatMap((g) => getGameCategories(g)))).sort(),
    [games],
  );

  const visibleCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter((cat) => cat.toLowerCase().includes(q));
  }, [allCategories, categorySearch]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    setPicked(null);
  };

  const filtered = games.filter((g) => {
    if (players !== "any") {
      const n = Number(players);
      if (players === "8") {
        if (g.maxPlayers != null && g.maxPlayers < 8) return false;
      } else {
        if (g.maxPlayers != null && n > g.maxPlayers) return false;
        if (g.minPlayers != null && n < g.minPlayers) return false;
      }
    }
    if (maxTime !== "any" && g.playTime != null && g.playTime > Number(maxTime)) return false;
    const wMax = WEIGHT_MAX[maxWeight];
    if (wMax != null && g.weight != null && g.weight > wMax) return false;
    if (!matchesLastPlayedFilter(g, lastPlayed, lastPlayedDates)) return false;
    if (selectedCategories.length > 0) {
      const gameCats = getGameCategories(g);
      if (!selectedCategories.every((cat) => gameCats.includes(cat))) return false;
    }
    return true;
  });

  const surprise = () => {
    if (filtered.length === 0 || rolling) return;
    setRolling(true);
    setPicked(null);
    setTimeout(() => {
      setPicked(filtered[Math.floor(Math.random() * filtered.length)]);
      setRolling(false);
    }, 700);
  };

  return (
    <PageTransition>
      <div className="max-w-xl mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Dices size={24} className="text-primary" />
          Game Picker
        </h1>

        <LibraryBar compact />

        <div className="space-y-4 mb-6">
          <FilterButtons
            label="Players"
            options={PLAYER_OPTIONS}
            value={players}
            labels={PLAYER_LABELS}
            onChange={(v) => {
              setPlayers(v);
              setPicked(null);
            }}
          />
          <FilterButtons
            label="Max play time"
            options={["any", "30", "60", "90", "120"] as TimeFilter[]}
            value={maxTime}
            labels={TIME_LABELS}
            onChange={(v) => {
              setMaxTime(v);
              setPicked(null);
            }}
          />
          <FilterButtons
            label="Complexity"
            options={["any", "light", "medium", "heavy"] as WeightFilter[]}
            value={maxWeight}
            labels={WEIGHT_LABELS}
            onChange={(v) => {
              setMaxWeight(v);
              setPicked(null);
            }}
          />
          <FilterButtons
            label="Last played"
            options={LAST_PLAYED_OPTIONS}
            value={lastPlayed}
            labels={LAST_PLAYED_LABELS}
            onChange={(v) => {
              setLastPlayed(v);
              setPicked(null);
            }}
          />

          {allCategories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Tag size={14} className="text-primary" />
                  Categories
                </p>
                {selectedCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategories([]);
                      setPicked(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear ({selectedCategories.length})
                  </button>
                )}
              </div>

              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCategories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 text-xs"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        aria-label={`Remove category filter ${cat}`}
                        onClick={() => toggleCategory(cat)}
                        className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                      >
                        <X size={11} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories…"
                  className="pl-8 h-8 text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-0.5">
                {visibleCategories.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    No matching categories.
                  </span>
                ) : (
                  visibleCategories.map((cat) => {
                    const isActive = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => toggleCategory(cat)}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border transition-all duration-200 ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/20"
                            : "bg-background hover:bg-muted border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
                        }`}
                      >
                        {isActive && <Check size={10} strokeWidth={3} />}
                        {cat}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          {isLoading
            ? "Loading…"
            : `${filtered.length} game${filtered.length !== 1 ? "s match" : " matches"}`}
        </div>

        <Button
          className="w-full mb-6 gap-2"
          size="lg"
          disabled={filtered.length === 0 || rolling}
          onClick={surprise}
        >
          <Dices size={18} className={rolling ? "animate-spin" : ""} />
          {rolling ? "Rolling…" : picked ? "Pick again" : "Surprise me!"}
        </Button>

        {isLoading && <Skeleton className="h-64 w-full" />}

        <AnimatePresence mode="wait">
          {!rolling && picked && (
            <motion.div
              key={picked.pk}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm font-medium text-muted-foreground mb-2">Tonight's pick:</p>
              <GameCard
                game={picked}
                playCounts={playCounts[idFromPk(picked.pk)]}
                lastPlayed={lastPlayedDates[idFromPk(picked.pk)]}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
