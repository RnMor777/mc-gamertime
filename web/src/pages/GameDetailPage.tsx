import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Dices,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  PenLine,
  Settings,
  Star,
  Trophy,
  Users,
  Users2,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { GameConfigDialog } from "../components/GameConfigDialog";
import { LogResultDialog } from "../components/LogResultDialog";
import { PageTransition } from "../components/PageTransition";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { Tooltip } from "../components/ui/tooltip";
import { useCountUp } from "../hooks/useCountUp";
import { useGames } from "../hooks/useGames";
import { usePosts } from "../hooks/usePosts";
import { useResults } from "../hooks/useResults";
import { useAuth } from "../lib/AuthContext";
import type { Result } from "../lib/types";
import { formatDate, idFromPk } from "../lib/utils";

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: games = [], isLoading: gL } = useGames();
  const { data: results = [], isLoading: rL } = useResults();
  const { data: posts = [], isLoading: pL } = usePosts();
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  const game = games.find((g) => idFromPk(g.pk) === id);
  const gamePk = game?.pk ?? "";
  const gameResults: Result[] = results.filter((r) => r.gameId === id || r.gameId === gamePk);
  const gamePosts = posts.filter((p) => p.gamePk === gamePk);

  const playerStats: Record<string, { name: string; wins: number; played: number }> = {};
  for (const r of gameResults) {
    for (const p of r.players) {
      if (!playerStats[p.playerId])
        playerStats[p.playerId] = { name: p.playerName, wins: 0, played: 0 };
      playerStats[p.playerId].played++;
    }
    if (r.winnerId && playerStats[r.winnerId]) playerStats[r.winnerId].wins++;
  }

  const topPlayers = Object.entries(playerStats)
    .filter(([, s]) => s.played >= 2)
    .map(([pid, s]) => ({ playerId: pid, ...s, winRate: s.wins / s.played }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  const scoredEntries = [...gameResults]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((r) =>
      r.players
        .filter((p) => p.score != null)
        .map((p) => ({
          playerId: p.playerId,
          playerName: p.playerName,
          score: p.score!,
          date: r.date,
        })),
    );
  const avgScore = scoredEntries.length
    ? scoredEntries.reduce((sum, e) => sum + e.score, 0) / scoredEntries.length
    : null;
  const bestScore = scoredEntries.length
    ? scoredEntries.reduce((best, e) => (e.score > best.score ? e : best))
    : null;

  const countSessions = useCountUp(gameResults.length);
  const countPlayers = useCountUp(Object.keys(playerStats).length);

  if (gL || rL || pL)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </div>
    );

  if (!game)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 text-center py-20 text-muted-foreground">
        <Dices size={48} className="mx-auto mb-4 opacity-30" />
        <p>Game not found.</p>
        <Link to="/" className="text-primary hover:underline mt-2 block">
          ← Catalog
        </Link>
      </div>
    );

  const bggUrl = game.bggId ? `https://boardgamegeek.com/boardgame/${game.bggId}` : undefined;
  const sortedResults = [...gameResults].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-8">
        <Link
          to="/catalog"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
        >
          <ChevronLeft size={16} />
          Catalog
        </Link>

        {game.imageUrl ? (
          <div className="relative w-full h-52 rounded-xl overflow-hidden -mx-4 md:mx-0">
            <img src={game.imageUrl} alt={game.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-4">
              <h1 className="text-2xl font-display font-bold text-white mb-1">{game.name}</h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70">
                {game.minPlayers != null && game.maxPlayers != null && (
                  <span className="flex items-center gap-1">
                    <Users2 size={11} />
                    {game.minPlayers}–{game.maxPlayers}
                  </span>
                )}
                {game.playTime != null && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {game.playTime}m
                  </span>
                )}
                {game.weight != null && (
                  <span className="flex items-center gap-1">
                    <Gauge size={11} />
                    {game.weight.toFixed(1)}
                  </span>
                )}
                {game.yearPublished != null && (
                  <span className="flex items-center gap-1">
                    <CalendarDays size={11} />
                    {game.yearPublished}
                  </span>
                )}
                {bggUrl && (
                  <a
                    href={bggUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <ExternalLink size={11} />
                    BGG
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-display font-bold mb-2">{game.name}</h1>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-xs text-muted-foreground">
              {game.minPlayers != null && game.maxPlayers != null && (
                <span className="flex items-center gap-1">
                  <Users2 size={12} />
                  {game.minPlayers}–{game.maxPlayers} players
                </span>
              )}
              {game.playTime != null && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {game.playTime} min
                </span>
              )}
              {game.weight != null && (
                <span className="flex items-center gap-1">
                  <Gauge size={12} />
                  {game.weight.toFixed(1)}
                </span>
              )}
              {game.yearPublished != null && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  {game.yearPublished}
                </span>
              )}
            </div>
            {bggUrl && (
              <a
                href={bggUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                View on BGG
              </a>
            )}
          </div>
        )}

        {game.description && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-display font-semibold mb-2">Description</h2>
            <p className="text-sm leading-6 text-muted-foreground whitespace-pre-line">
              {game.description}
            </p>
          </section>
        )}

        {game.rulebooks && game.rulebooks.length > 0 && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-display font-semibold mb-3">Rule books</h2>
            <div className="space-y-2">
              {game.rulebooks.map((rulebook) => (
                <a
                  key={rulebook.id}
                  href={rulebook.url}
                  download={rulebook.filename}
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-primary shrink-0" />
                    <span className="truncate">{rulebook.filename}</span>
                  </span>
                  <Download size={14} className="text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-semibold">Stats</h2>
            {user?.role === "admin" ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfigDialog(true)}
                  className="gap-1.5"
                >
                  <Settings size={14} />
                  Configure
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogDialog(true)}
                  className="gap-1.5"
                >
                  <PenLine size={14} />
                  Log this game
                </Button>
              </div>
            ) : (
              <Tooltip text="Only admins can log results">
                <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-40">
                  <PenLine size={14} />
                  Log this game
                </Button>
              </Tooltip>
            )}
          </div>
          <div
            className={`grid gap-4 mb-4 ${avgScore != null ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}
          >
            {[{ label: "Sessions", value: countSessions, icon: <Dices size={18} className="mx-auto mb-1 text-primary" /> }, { label: "Players", value: countPlayers, icon: <Users size={18} className="mx-auto mb-1 text-primary" /> }, ...(avgScore != null ? [{ label: "Avg score", value: avgScore.toFixed(1), icon: <Star size={18} className="mx-auto mb-1 text-primary" /> }, { label: "High score", value: String(bestScore?.score), icon: <Trophy size={18} className="mx-auto mb-1 text-primary" /> }] : [])].map(({ label, value, icon }) => (
              <div key={label} className="bg-card rounded-lg border p-3 text-center">
                {icon}
                <div className="text-xl font-display font-bold">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          {topPlayers[0] && (
            <div className="bg-card rounded-lg border p-3 flex items-center gap-3">
              <Trophy size={16} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Top winner</div>
                <div className="font-display font-semibold truncate">{topPlayers[0].name}</div>
              </div>
              <div className="ml-auto text-sm text-muted-foreground shrink-0">
                {topPlayers[0].wins}W · {(topPlayers[0].winRate * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {bestScore && (
            <div className="bg-card rounded-lg border p-3 flex items-center gap-3 mt-4">
              <Star size={16} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Best score</div>
                <div className="font-display font-semibold truncate">{bestScore.playerName}</div>
              </div>
              <div className="ml-auto text-sm text-muted-foreground shrink-0">
                {bestScore.score} · {formatDate(bestScore.date)}
              </div>
            </div>
          )}
        </section>

        {topPlayers.length > 0 ? (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Top Players</h2>
            <div className="space-y-2">
              {topPlayers.map((p, i) => (
                <div
                  key={p.playerId}
                  className="flex items-center justify-between text-sm p-2 rounded-lg bg-card border hover:border-primary/20 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4 text-xs">{i + 1}.</span>
                    <Avatar name={p.name} size="sm" />
                    <Link
                      to={`/players/${p.playerId}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {p.name}
                    </Link>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {p.wins}W / {p.played} · {(p.winRate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : sortedResults.length > 0 ? (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Top Players</h2>
            <div className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground italic">
              Play this game at least twice to see top players.
            </div>
          </section>
        ) : null}

        {sortedResults.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Session History</h2>
            <div className="space-y-2">
              {sortedResults.map((r) => (
                <div
                  key={r.pk}
                  className="flex items-center justify-between text-sm p-2 rounded-lg bg-card border hover:border-primary/20 transition-colors"
                >
                  <span className="text-muted-foreground text-xs">{formatDate(r.date)}</span>
                  <span>
                    {r.players.map((p, i) => (
                      <span key={p.playerId}>
                        {i > 0 && ", "}
                        <Link
                          to={`/players/${p.playerId}`}
                          className={`hover:text-primary transition-colors ${p.playerId === r.winnerId ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        >
                          {p.playerName}
                        </Link>
                        {p.score != null && (
                          <span className="text-muted-foreground text-xs ml-0.5">({p.score})</span>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {gamePosts.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Posts</h2>
            <div className="space-y-3">
              {gamePosts.map((p) => (
                <PostCard key={p.pk} post={p} />
              ))}
            </div>
          </section>
        )}
      </div>
      <LogResultDialog
        open={showLogDialog}
        onClose={() => setShowLogDialog(false)}
        defaultGameId={id}
      />
      <GameConfigDialog
        open={showConfigDialog}
        onClose={() => setShowConfigDialog(false)}
        game={game}
      />
    </PageTransition>
  );
}
