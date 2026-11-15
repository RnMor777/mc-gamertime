import { Dices, Layers, PenLine, Trophy } from "lucide-react";
import { GithubIcon } from "../components/ui/github-icon";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { LogResultDialog } from "../components/LogResultDialog";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useCountUp } from "../hooks/useCountUp";
import { useResults } from "../hooks/useResults";
import { useDisplayName, usePublicSettings } from "../hooks/useSettings";
import { useStats } from "../hooks/useStats";
import { useAuth } from "../lib/AuthContext";
import { formatDate, pluralize } from "../lib/utils";

function AnimatedNumber({ value }: { value: number }) {
  const count = useCountUp(value);
  return <>{count}</>;
}

const RANK_COLORS = ["text-yellow-400", "text-slate-400", "text-amber-600"];

export default function HomePage() {
  const { user } = useAuth();
  const { data: results = [], isLoading: rL } = useResults();
  const { data: stats, isLoading: sL } = useStats();
  const { data: publicSettings } = usePublicSettings();
  const displayName = useDisplayName();
  const sourceUrl = publicSettings?.sourceUrl ?? null;
  const [showLog, setShowLog] = useState(false);

  const recentSessions = useMemo(
    () => [...results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [results],
  );

  // Lazy initializer: `new Date()` is impure, so it must not run on every render.
  const [cutoffStr] = useState(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return cutoff.toISOString().slice(0, 10);
  });

  const thisWeek = useMemo(() => {
    const week = results.filter((r) => r.date >= cutoffStr);
    return {
      count: week.length,
      myWins: week.filter((r) => r.winnerId === user?.sub).length,
    };
  }, [results, user, cutoffStr]);

  const isLoading = rL || sL;

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">
              Welcome back, {user?.displayName?.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {results.length > 0
                ? `${pluralize(results.length, "session")} logged`
                : "No sessions yet — go play something"}
            </p>
          </div>
          <Button onClick={() => setShowLog(true)} className="gap-2 shrink-0">
            <PenLine size={15} />
            Log session
          </Button>
        </div>

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border p-4">
              <div className="text-xs text-muted-foreground mb-1">Sessions this week</div>
              <div className="text-3xl font-display font-bold">
                <AnimatedNumber value={thisWeek.count} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {thisWeek.count === 0
                  ? "no games yet"
                  : thisWeek.count === 1
                    ? "1 session"
                    : `${thisWeek.count} sessions`}
              </div>
            </div>
            <div className="bg-card rounded-xl border p-4">
              <div className="text-xs text-muted-foreground mb-1">Your wins this week</div>
              <div className="text-3xl font-display font-bold">
                <AnimatedNumber value={thisWeek.myWins} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {thisWeek.count > 0 ? `of ${thisWeek.count} played` : "no sessions yet"}
              </div>
            </div>
            {stats?.mostPlayed ? (
              <div className="bg-card rounded-xl border p-4 col-span-2 sm:col-span-1">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Dices size={11} /> Most played
                </div>
                <div className="text-lg font-display font-bold leading-tight line-clamp-1">
                  {stats.mostPlayed.gameName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {stats.mostPlayed.count} session{stats.mostPlayed.count !== 1 ? "s" : ""}
                </div>
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>
        )}

        {/* Two-column: recent sessions + standings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent sessions */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Sessions
              </h2>
              <Link to="/log" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Dices size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No sessions yet</p>
                <button
                  onClick={() => setShowLog(true)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Log your first game →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((r) => (
                  <div
                    key={r.pk}
                    className="flex items-center justify-between p-3 rounded-lg bg-card border hover:border-primary/20 transition-colors text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.gameName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-2">
                      <Trophy size={11} className="text-primary" />
                      <span className="truncate max-w-[80px]">{r.winnerName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Standings */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Standings
              </h2>
              <Link to="/leaderboard" className="text-xs text-primary hover:underline">
                Full table →
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !stats?.leaderboard.length ? (
              <div className="text-center py-10 text-muted-foreground">
                <Trophy size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No standings yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.leaderboard.slice(0, 5).map((e, i) => (
                  <Link
                    key={e.playerId}
                    to={`/players/${e.playerId}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border hover:border-primary/20 transition-colors"
                  >
                    <span className="w-4 shrink-0">
                      {i < 3 ? (
                        <Trophy size={13} className={RANK_COLORS[i]} />
                      ) : (
                        <span className="text-xs text-muted-foreground">{i + 1}</span>
                      )}
                    </span>
                    <Avatar name={e.name} size="sm" />
                    <span className="text-sm font-medium flex-1 truncate">{e.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {e.wins}W · {(e.winRate * 100).toFixed(0)}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Quick links */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/catalog"
              className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/30 transition-colors text-sm font-medium"
            >
              <Layers size={16} className="text-primary" /> Game Catalog
            </Link>
            <Link
              to="/picker"
              className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/30 transition-colors text-sm font-medium"
            >
              <Dices size={16} className="text-primary" /> Game Picker
            </Link>
          </div>
        </section>

        {/* Links to Settings → Landing Page → Source Code URL; hidden while unset. */}
        {sourceUrl && (
          <div className="pt-4 pb-2 flex justify-center items-center gap-3">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
            >
              {displayName}
            </a>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-30 hover:opacity-70 transition-opacity"
              title="Source code"
              aria-label="Source code"
            >
              <GithubIcon className="w-7 h-7" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
      <LogResultDialog open={showLog} onClose={() => setShowLog(false)} />
    </PageTransition>
  );
}
