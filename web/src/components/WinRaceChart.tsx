import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isResultWinner } from "../lib/utils";
import type { Result } from "../lib/types";

const CHART_COLORS = [
  "#f5a623",
  "#818cf8",
  "#e11d48",
  "#059669",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

interface Props {
  results: Result[];
}

function formatTick(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WinRaceChart({ results }: Props) {
  const { data, players } = useMemo(() => {
    const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
    const counts: Record<string, { wins: number; played: number; name: string }> = {};

    const rawData: Array<Record<string, number | string>> = [];

    for (const r of sorted) {
      for (const p of r.players) {
        if (p.isGuest) continue;
        if (!counts[p.playerId]) counts[p.playerId] = { wins: 0, played: 0, name: p.playerName };
        counts[p.playerId].played++;
        if (isResultWinner(r, p.playerId)) counts[p.playerId].wins++;
      }
      const point: Record<string, number | string> = {
        date: r.date,
      };
      for (const [pid, s] of Object.entries(counts)) {
        if (s.played >= 3) {
          point[pid] = Math.round((s.wins / s.played) * 100);
        }
      }
      rawData.push(point);
    }

    const players = Object.entries(counts).map(([id, s]) => ({ id, name: s.name }));
    return { data: rawData, players };
  }, [results]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  if (data.length < 5 || players.length < 2)
    return (
      <p className="text-muted-foreground text-sm">
        Log at least 5 sessions with 3+ plays each to see win rate trends.
      </p>
    );

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {players.map((p, i) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
              hidden.has(p.id) ? "opacity-40 bg-background border-input" : "bg-card border-border"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {p.name}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            tickFormatter={formatTick}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
          <Tooltip
            formatter={(v, name) => [
              `${Number(v)}%`,
              players.find((p) => p.id === name)?.name ?? name,
            ]}
            labelFormatter={(label) => (typeof label === "string" ? formatTick(label) : label)}
            contentStyle={{
              fontSize: 12,
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          {players.map((p, i) =>
            hidden.has(p.id) ? null : (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
