import { Check, Dices } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { GameCard } from "../components/GameCard";
import { LibraryBar } from "../components/LibraryBar";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useGames } from "../hooks/useGames";
import type { Game } from "../lib/types";

type PlayerFilter = "any" | "2" | "3" | "4" | "5";
type TimeFilter = "any" | "30" | "60" | "90" | "120";
type WeightFilter = "any" | "light" | "medium" | "heavy";

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
  const [players, setPlayers] = useState<PlayerFilter>("any");
  const [maxTime, setMaxTime] = useState<TimeFilter>("any");
  const [maxWeight, setMaxWeight] = useState<WeightFilter>("any");
  const [picked, setPicked] = useState<Game | null>(null);
  const [rolling, setRolling] = useState(false);

  const filtered = games.filter((g) => {
    if (players !== "any") {
      const n = Number(players);
      if (g.maxPlayers != null && n > g.maxPlayers) return false;
      if (g.minPlayers != null && n < g.minPlayers) return false;
    }
    if (maxTime !== "any" && g.playTime != null && g.playTime > Number(maxTime)) return false;
    const wMax = WEIGHT_MAX[maxWeight];
    if (wMax != null && g.weight != null && g.weight > wMax) return false;
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
            options={["any", "2", "3", "4", "5"] as PlayerFilter[]}
            value={players}
            labels={{ any: "Any", "2": "2", "3": "3", "4": "4", "5": "5+" }}
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
              <GameCard game={picked} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
