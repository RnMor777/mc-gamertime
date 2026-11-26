import { Calendar, ChevronLeft, Clock, Crown, Dices, Flame, Trophy, Zap } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { Skeleton } from "../components/ui/skeleton";
import { useCountUp } from "../hooks/useCountUp";
import { useResults } from "../hooks/useResults";
import { useStats } from "../hooks/useStats";
import { formatDate, isResultWinner, pluralize } from "../lib/utils";

function RecordCard({
  icon,
  label,
  value,
  valueSuffix,
  numericValue,
  sub,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueSuffix?: string;
  numericValue?: number;
  sub?: string;
  accent?: boolean;
}) {
  const count = useCountUp(numericValue ?? 0);
  const displayValue = numericValue !== undefined ? `${count}${valueSuffix ?? ""}` : value;
  return (
    <div
      className={`rounded-xl border p-4 bg-card ${accent ? "border-primary/40 bg-primary/5" : ""}`}
    >
      <div className={`mb-2 ${accent ? "text-primary" : "text-muted-foreground"}`}>{icon}</div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-display font-bold text-lg leading-tight">{displayValue}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function RecordsPage() {
  const { data: results = [], isLoading: rL } = useResults();
  const { data: stats, isLoading: sL } = useStats();
  const isLoading = rL || sL;

  const records = useMemo(() => {
    if (!results.length) return null;
    const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));

    // Longest win/losing streaks (all-time)
    const streakBest: Record<string, { wins: number; losses: number; name: string }> = {};
    const streakCurrent: Record<string, { wins: number; losses: number }> = {};
    for (const r of sorted) {
      for (const p of r.players) {
        if (p.isGuest) continue;
        if (!streakBest[p.playerId])
          streakBest[p.playerId] = { wins: 0, losses: 0, name: p.playerName };
        if (!streakCurrent[p.playerId]) streakCurrent[p.playerId] = { wins: 0, losses: 0 };
        if (isResultWinner(r, p.playerId)) {
          streakCurrent[p.playerId].wins++;
          streakCurrent[p.playerId].losses = 0;
          if (streakCurrent[p.playerId].wins > streakBest[p.playerId].wins)
            streakBest[p.playerId].wins = streakCurrent[p.playerId].wins;
        } else {
          streakCurrent[p.playerId].losses++;
          streakCurrent[p.playerId].wins = 0;
          if (streakCurrent[p.playerId].losses > streakBest[p.playerId].losses)
            streakBest[p.playerId].losses = streakCurrent[p.playerId].losses;
        }
      }
    }
    const bestWinStreak = Object.entries(streakBest)
      .map(([, s]) => s)
      .sort((a, b) => b.wins - a.wins)[0];
    const bestLoseStreak = Object.entries(streakBest)
      .map(([, s]) => s)
      .sort((a, b) => b.losses - a.losses)[0];

    // Most sessions in one day
    const byDate: Record<string, number> = {};
    for (const r of results) byDate[r.date] = (byDate[r.date] ?? 0) + 1;
    const [busiestDate, busiestCount] = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0] ?? [
      "",
      0,
    ];

    // First game ever
    const firstGame = sorted[0];

    // Most sessions total
    const totalSessions = results.length;

    // Unique games played
    const uniqueGames = new Set(results.map((r) => r.gameId)).size;

    // Player with the highest Elo rating (all-time champion)
    const champion = stats?.leaderboard[0];

    // Most active month
    const mostActiveMonth = stats?.perMonth.slice().sort((a, b) => b.count - a.count)[0];

    return {
      bestWinStreak,
      bestLoseStreak,
      busiestDate,
      busiestCount,
      firstGame,
      totalSessions,
      uniqueGames,
      champion,
      mostActiveMonth,
      mostPlayed: stats?.mostPlayed,
    };
  }, [results, stats]);

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-8">
        <div>
          <Link
            to="/leaderboard"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-4"
          >
            <ChevronLeft size={16} /> Leaderboard
          </Link>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Crown size={24} className="text-primary" />
            All-Time Records
          </h1>
          <p className="text-sm text-muted-foreground mt-1">The legends of game night.</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : !records ? (
          <p className="text-muted-foreground text-center py-16">No games logged yet.</p>
        ) : (
          <>
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Group Records
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <RecordCard
                  icon={<Dices size={18} />}
                  label="Total sessions"
                  value={String(records.totalSessions)}
                  numericValue={records.totalSessions}
                  sub="and counting"
                />
                <RecordCard
                  icon={<Zap size={18} />}
                  label="Games in catalog played"
                  value={String(records.uniqueGames)}
                  numericValue={records.uniqueGames}
                  sub="unique titles"
                />
                {records.mostPlayed && (
                  <RecordCard
                    icon={<Trophy size={18} />}
                    label="Most-played game"
                    value={records.mostPlayed.gameName}
                    sub={pluralize(records.mostPlayed.count, "session")}
                    accent
                  />
                )}
                {records.mostActiveMonth && (
                  <RecordCard
                    icon={<Calendar size={18} />}
                    label="Most active month"
                    value={(() => {
                      const [y, m] = records.mostActiveMonth.month.split("-");
                      return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      });
                    })()}
                    sub={pluralize(records.mostActiveMonth.count, "session")}
                  />
                )}
                {records.busiestCount > 1 && (
                  <RecordCard
                    icon={<Clock size={18} />}
                    label="Most games in one day"
                    value={`${records.busiestCount} sessions`}
                    numericValue={records.busiestCount}
                    valueSuffix=" sessions"
                    sub={formatDate(records.busiestDate)}
                  />
                )}
                {records.firstGame && (
                  <RecordCard
                    icon={<Calendar size={18} />}
                    label="First game ever"
                    value={records.firstGame.gameName}
                    sub={formatDate(records.firstGame.date)}
                  />
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Player Records
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {records.champion && (
                  <RecordCard
                    icon={<Crown size={18} />}
                    label="All-time champion"
                    value={records.champion.name}
                    sub={`${records.champion.rating} rating · ${pluralize(records.champion.wins, "win")}`}
                    accent
                  />
                )}
                {records.bestWinStreak && records.bestWinStreak.wins > 1 && (
                  <RecordCard
                    icon={<Flame size={18} />}
                    label="Longest win streak"
                    value={`${records.bestWinStreak.wins} in a row`}
                    numericValue={records.bestWinStreak.wins}
                    valueSuffix=" in a row"
                    sub={records.bestWinStreak.name}
                  />
                )}
                {records.bestLoseStreak && records.bestLoseStreak.losses > 1 && (
                  <RecordCard
                    icon={<Zap size={18} />}
                    label="Longest losing streak"
                    value={`${records.bestLoseStreak.losses} in a row`}
                    numericValue={records.bestLoseStreak.losses}
                    valueSuffix=" in a row"
                    sub={records.bestLoseStreak.name}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PageTransition>
  );
}
