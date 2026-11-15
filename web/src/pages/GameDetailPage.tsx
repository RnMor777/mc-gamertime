import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Dices,
  ExternalLink,
  Gauge,
  Layers,
  PenLine,
  Plus,
  Settings,
  Star,
  Trash2,
  Trophy,
  Users,
  Users2,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AddExpansionDialog } from "../components/AddExpansionDialog";
import { Avatar } from "../components/Avatar";
import { GameConfigDialog } from "../components/GameConfigDialog";
import { LogResultDialog } from "../components/LogResultDialog";
import { PageTransition } from "../components/PageTransition";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { Tooltip } from "../components/ui/tooltip";
import { useCountUp } from "../hooks/useCountUp";
import { useDeleteGameExpansion, useGames } from "../hooks/useGames";
import { useLibraries } from "../hooks/useLibraries";
import { usePosts } from "../hooks/usePosts";
import { useResults } from "../hooks/useResults";
import { useAuth } from "../lib/AuthContext";
import type { GameExpansion, Result } from "../lib/types";
import { formatDate, idFromPk } from "../lib/utils";

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { canEditActiveLibrary } = useLibraries();
  const { data: games = [], isLoading: gL } = useGames();
  const { data: results = [], isLoading: rL } = useResults();
  const { data: posts = [], isLoading: pL } = usePosts();
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showAddExpansionDialog, setShowAddExpansionDialog] = useState(false);
  const [activeExpansion, setActiveExpansion] = useState<GameExpansion | null>(null);
  const deleteExpansion = useDeleteGameExpansion();

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
  // strict > keeps the FIRST (earliest) achiever on ties
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
          <section aria-labelledby="game-description-heading">
            <h2 id="game-description-heading" className="text-lg font-display font-semibold mb-3">
              About this game
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {game.description}
            </p>
          </section>
        )}

        <section aria-labelledby="game-expansions-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="game-expansions-heading"
              className="text-lg font-display font-semibold flex items-center gap-2"
            >
              <Layers size={18} className="text-primary" />
              Expansions
              {(game.expansions?.length ?? 0) > 0 && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {game.expansions?.length}
                </span>
              )}
            </h2>
            {canEditActiveLibrary && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddExpansionDialog(true)}
                className="gap-1.5"
              >
                <Plus size={14} />
                Add expansion
              </Button>
            )}
          </div>

          {!game.expansions || game.expansions.length === 0 ? (
            <div className="rounded-lg border bg-card/50 p-4 text-sm text-muted-foreground flex items-center justify-between gap-2">
              <span>No expansions tracked for this game yet.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {game.expansions.map((exp) => {
                const expBggUrl = exp.bggId
                  ? `https://boardgamegeek.com/boardgameexpansion/${exp.bggId}`
                  : undefined;
                return (
                  <div
                    key={exp.id}
                    className="rounded-lg border bg-card p-3 hover:border-primary/30 transition-colors flex gap-3 items-start"
                  >
                    {exp.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setActiveExpansion(exp)}
                        className="shrink-0 rounded-md overflow-hidden w-16 h-16 bg-muted"
                      >
                        <img
                          src={exp.imageUrl}
                          alt={exp.name}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveExpansion(exp)}
                        className="shrink-0 rounded-md w-16 h-16 bg-muted flex items-center justify-center text-muted-foreground"
                      >
                        <Layers size={20} />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveExpansion(exp)}
                          className="text-left font-display font-semibold text-sm hover:text-primary transition-colors"
                        >
                          {exp.name}
                          {exp.yearPublished != null && (
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">
                              ({exp.yearPublished})
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {expBggUrl && (
                            <a
                              href={expBggUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary p-1"
                              title="View expansion on BGG"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                          {canEditActiveLibrary && (
                            <button
                              type="button"
                              aria-label={`Remove ${exp.name}`}
                              onClick={() =>
                                deleteExpansion.mutate({
                                  gameId: idFromPk(game.pk),
                                  expansionId: exp.id,
                                })
                              }
                              className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {exp.minPlayers != null && exp.maxPlayers != null && (
                          <span className="flex items-center gap-1">
                            <Users2 size={11} />
                            {exp.minPlayers}–{exp.maxPlayers} players
                          </span>
                        )}
                        {exp.playTime != null && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {exp.playTime}m
                          </span>
                        )}
                        {exp.weight != null && (
                          <span className="flex items-center gap-1">
                            <Gauge size={11} />
                            {exp.weight.toFixed(1)}
                          </span>
                        )}
                      </div>

                      {exp.description && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                          {exp.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-semibold">Stats</h2>
            <div className="flex gap-2">
              {canEditActiveLibrary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfigDialog(true)}
                  className="gap-1.5"
                >
                  <Settings size={14} />
                  Configure
                </Button>
              )}
              {user?.role === "admin" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogDialog(true)}
                  className="gap-1.5"
                >
                  <PenLine size={14} />
                  Log this game
                </Button>
              ) : (
                <Tooltip text="Only admins can log results">
                  <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-40">
                    <PenLine size={14} />
                    Log this game
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
          <div
            className={`grid gap-4 mb-4 ${avgScore != null ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}
          >
            {[
              {
                label: "Sessions",
                value: countSessions,
                icon: <Dices size={18} className="mx-auto mb-1 text-primary" />,
              },
              {
                label: "Players",
                value: countPlayers,
                icon: <Users size={18} className="mx-auto mb-1 text-primary" />,
              },
              ...(avgScore != null
                ? [
                    {
                      label: "Avg score",
                      value: avgScore.toFixed(1),
                      icon: <Star size={18} className="mx-auto mb-1 text-primary" />,
                    },
                    {
                      label: "High score",
                      value: String(bestScore?.score),
                      icon: <Trophy size={18} className="mx-auto mb-1 text-primary" />,
                    },
                  ]
                : []),
            ].map(({ label, value, icon }) => (
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
      <AddExpansionDialog
        open={showAddExpansionDialog}
        onClose={() => setShowAddExpansionDialog(false)}
        game={game}
      />
      <Dialog
        open={!!activeExpansion}
        onClose={() => setActiveExpansion(null)}
        title={activeExpansion?.name ?? "Expansion Detail"}
      >
        {activeExpansion && (
          <div className="space-y-4">
            {activeExpansion.imageUrl && (
              <img
                src={activeExpansion.imageUrl}
                alt={activeExpansion.name}
                className="w-full h-48 object-cover rounded-md"
              />
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {activeExpansion.yearPublished != null && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  {activeExpansion.yearPublished}
                </span>
              )}
              {activeExpansion.minPlayers != null && activeExpansion.maxPlayers != null && (
                <span className="flex items-center gap-1">
                  <Users2 size={12} />
                  {activeExpansion.minPlayers}–{activeExpansion.maxPlayers} players
                </span>
              )}
              {activeExpansion.playTime != null && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {activeExpansion.playTime} min
                </span>
              )}
              {activeExpansion.weight != null && (
                <span className="flex items-center gap-1">
                  <Gauge size={12} />
                  Weight {activeExpansion.weight.toFixed(1)}
                </span>
              )}
              {activeExpansion.bggId && (
                <a
                  href={`https://boardgamegeek.com/boardgameexpansion/${activeExpansion.bggId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink size={12} />
                  View on BGG
                </a>
              )}
            </div>
            {activeExpansion.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                {activeExpansion.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description available.</p>
            )}
            <div className="flex justify-end gap-2">
              {canEditActiveLibrary && (
                <Button
                  variant="destructive"
                  size="sm"
                  isLoading={deleteExpansion.isPending}
                  onClick={async () => {
                    await deleteExpansion.mutateAsync({
                      gameId: idFromPk(game.pk),
                      expansionId: activeExpansion.id,
                    });
                    setActiveExpansion(null);
                  }}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Remove Expansion
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setActiveExpansion(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </PageTransition>
  );
}
