import { Pencil, PenLine, Plus, Trash2, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { LogResultDialog, MOODS } from "../components/LogResultDialog";
import { PageTransition } from "../components/PageTransition";
import { SessionPhotos } from "../components/SessionPhotos";
import { SessionReactions } from "../components/SessionReactions";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useGames } from "../hooks/useGames";
import { usePosts } from "../hooks/usePosts";
import { useDeleteResult, useResults } from "../hooks/useResults";
import { useAuth } from "../lib/AuthContext";
import type { Result } from "../lib/types";
import { colorForName, formatDate, idFromPk } from "../lib/utils";

export default function LogResult() {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Result | null>(null);
  const { data: results = [], isLoading } = useResults();
  const { data: games = [] } = useGames();
  const { data: posts = [] } = usePosts();
  const deleteResult = useDeleteResult();
  const { user } = useAuth();

  const postBySession = new Map(posts.filter((p) => p.sessionPk).map((p) => [p.sessionPk, p]));

  const groupedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => b.date.localeCompare(a.date));
    const map: Record<string, typeof results> = {};
    for (const r of sorted) {
      const key = r.date.slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [results]);

  function gameImageUrl(gameId: string): string | undefined {
    return games.find((g) => idFromPk(g.pk) === gameId || g.pk === gameId)?.imageUrl;
  }

  async function handleDelete(pk: string) {
    await deleteResult.mutateAsync(pk);
    setConfirmDelete(null);
  }

  return (
    <PageTransition>
      <div className="max-w-xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <PenLine size={24} className="text-primary" />
            Chronicle
          </h1>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus size={16} />
            Log session
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && results.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <PenLine size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-display font-semibold">No sessions yet</p>
            <Button className="mt-4 gap-1.5" onClick={() => setOpen(true)}>
              <Plus size={16} />
              Log your first game
            </Button>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-10">
            {groupedResults.map(([key, monthResults]) => {
              const [year, month] = key.split("-");
              const label = new Date(+year, +month - 1, 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              });
              return (
                <div key={key}>
                  {/* Month divider */}
                  <div className="flex items-center gap-4 mb-5">
                    <h3 className="text-2xl font-display font-bold text-muted-foreground whitespace-nowrap">
                      {label}
                    </h3>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {monthResults.length} session{monthResults.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Timeline */}
                  <div className="space-y-3">
                    {monthResults.map((r, idx) => {
                      const linkedPost = postBySession.get(r.pk);
                      const isConfirming = confirmDelete === r.pk;
                      const imgUrl = gameImageUrl(r.gameId);
                      const isMyWin = r.winnerId === user?.sub;

                      return (
                        <motion.div
                          key={r.pk}
                          initial={{ opacity: 0, y: 8 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-40px" }}
                          transition={{ duration: 0.3, delay: idx * 0.04 }}
                        >
                          <div
                            className={`bg-card rounded-xl border p-3 flex gap-3 hover:border-primary/20 transition-colors border-l-2 ${isMyWin ? "border-l-primary" : "border-l-transparent"}`}
                          >
                            {/* Game thumbnail */}
                            <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
                              {imgUrl ? (
                                <img
                                  src={imgUrl}
                                  alt={r.gameName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center font-display font-bold text-white text-xl"
                                  style={{ backgroundColor: colorForName(r.gameName) }}
                                >
                                  {r.gameName[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-display font-semibold leading-tight truncate">
                                  {r.gameName}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {r.mood != null && (
                                    <span title={MOODS.find((m) => m.value === r.mood)?.label}>
                                      {MOODS.find((m) => m.value === r.mood)?.emoji}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(r.date)}
                                  </span>
                                  {user && !isConfirming && (
                                    <button
                                      onClick={() => setEditTarget(r)}
                                      className="text-muted-foreground hover:text-foreground transition-colors p-2 -my-1.5 rounded-md hover:bg-muted/60"
                                      aria-label="Edit result"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  )}
                                  {user && !isConfirming && (
                                    <button
                                      onClick={() => setConfirmDelete(r.pk)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-2 -my-1.5 rounded-md hover:bg-muted/60"
                                      aria-label="Delete result"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Players: name + score, winner first-class */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {r.players.map((p) => {
                                  const isWinner = p.playerId === r.winnerId;
                                  return (
                                    <Link
                                      key={p.playerId}
                                      to={`/players/${p.playerId}`}
                                      className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs transition-colors hover:border-primary/40 ${
                                        isWinner
                                          ? "border-primary/40 bg-primary/10 text-foreground"
                                          : "bg-muted/40 text-muted-foreground"
                                      }`}
                                    >
                                      <span aria-hidden="true">
                                        <Avatar name={p.playerName} size="sm" />
                                      </span>
                                      {isWinner && (
                                        <Trophy
                                          size={10}
                                          className="text-primary shrink-0"
                                          aria-label="Winner"
                                        />
                                      )}
                                      <span className="font-medium">{p.playerName}</span>
                                      {p.score != null && (
                                        <span className="tabular-nums">{p.score}</span>
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>

                              {r.notes && (
                                <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-line break-words">
                                  {r.notes}
                                </p>
                              )}

                              {isConfirming ? (
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Delete?</span>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDelete(r.pk)}
                                    isLoading={deleteResult.isPending}
                                  >
                                    Yes
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDelete(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <SessionPhotos sessionPk={r.pk} />
                                  <SessionReactions
                                    sessionPk={r.pk}
                                    actions={
                                      linkedPost ? (
                                        <Link
                                          to={`/posts/${idFromPk(linkedPost.pk)}`}
                                          className="text-xs text-primary hover:underline font-medium px-1"
                                        >
                                          Read post →
                                        </Link>
                                      ) : user?.role === "admin" ? (
                                        <Link
                                          to={`/posts/new?session=${r.pk}`}
                                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                                        >
                                          <PenLine size={12} aria-hidden="true" />
                                          Write post
                                        </Link>
                                      ) : null
                                    }
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <LogResultDialog open={open} onClose={() => setOpen(false)} />
        <LogResultDialog
          open={editTarget != null}
          onClose={() => setEditTarget(null)}
          editResult={editTarget ?? undefined}
        />
      </div>
    </PageTransition>
  );
}
