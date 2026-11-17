import { ChevronDown, ChevronUp, PenLine, Plus, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useGames } from "../hooks/useGames";
import {
  useCreateRecommended,
  useDeleteRecommended,
  useRecommended,
  useUpdateRecommended,
} from "../hooks/useRecommended";
import type { Recommendation } from "../lib/types";
import { gameMatchesSearch, idFromPk } from "../lib/utils";

const EMPTY_FORM = { gamePk: "", blurb: "", tags: "", bestFor: "", order: 1 };

export default function AdminRecommendedPage() {
  const { data: recs = [], isLoading: rL } = useRecommended();
  const { data: games = [], isLoading: gL } = useGames();
  const createRec = useCreateRecommended();
  const updateRec = useUpdateRecommended();
  const deleteRec = useDeleteRecommended();

  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Recommendation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [gameSearch, setGameSearch] = useState("");
  const [error, setError] = useState("");

  const sorted = [...recs].sort((a, b) => a.order - b.order);

  function openCreate() {
    setEditTarget(null);
    const nextOrder = sorted.length > 0 ? Math.max(...sorted.map((r) => r.order)) + 1 : 1;
    setForm({ ...EMPTY_FORM, order: nextOrder });
    setGameSearch("");
    setError("");
    setShowDialog(true);
  }

  function openEdit(rec: Recommendation) {
    setEditTarget(rec);
    setForm({
      gamePk: rec.gamePk,
      blurb: rec.blurb,
      tags: rec.tags.join(", "),
      bestFor: rec.bestFor,
      order: rec.order,
    });
    setGameSearch("");
    setError("");
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setGameSearch("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (editTarget) {
        await updateRec.mutateAsync({
          id: idFromPk(editTarget.pk),
          data: { blurb: form.blurb, tags, bestFor: form.bestFor, order: form.order },
        });
      } else {
        if (!form.gamePk) {
          setError("Please select a game.");
          return;
        }
        await createRec.mutateAsync({
          gamePk: form.gamePk,
          blurb: form.blurb,
          tags,
          bestFor: form.bestFor,
          order: form.order,
        });
      }
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    }
  }

  async function moveUp(rec: Recommendation, idx: number) {
    if (idx === 0) return;
    const above = sorted[idx - 1];
    await updateRec.mutateAsync({ id: idFromPk(rec.pk), data: { order: above.order } });
    await updateRec.mutateAsync({ id: idFromPk(above.pk), data: { order: rec.order } });
  }

  async function moveDown(rec: Recommendation, idx: number) {
    if (idx === sorted.length - 1) return;
    const below = sorted[idx + 1];
    await updateRec.mutateAsync({ id: idFromPk(rec.pk), data: { order: below.order } });
    await updateRec.mutateAsync({ id: idFromPk(below.pk), data: { order: rec.order } });
  }

  async function handleDelete(rec: Recommendation) {
    if (!window.confirm(`Delete recommendation for ${rec.gameName}?`)) return;
    await deleteRec.mutateAsync(idFromPk(rec.pk));
  }

  const isPending = createRec.isPending || updateRec.isPending || deleteRec.isPending;

  if (rL || gL)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Star size={24} className="text-primary" />
            Recommended Games
          </h1>
          <Button onClick={openCreate} className="gap-1.5 shrink-0">
            <Plus size={16} />
            Add Game
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            No recommendations yet. Add one!
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((rec, idx) => (
              <div
                key={rec.pk}
                className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/20 transition-colors"
              >
                {rec.imageUrl ? (
                  <img
                    src={rec.imageUrl}
                    alt={rec.gameName}
                    className="w-12 h-12 object-cover rounded-sm shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-sm bg-muted flex items-center justify-center text-lg font-display font-bold text-muted-foreground shrink-0">
                    {rec.gameName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-40">
                  <p className="font-medium truncate">{rec.gameName}</p>
                  <p className="text-xs text-muted-foreground truncate">{rec.blurb}</p>
                </div>
                {/* Wraps under the name on phones instead of squeezing it to nothing. */}
                <div className="flex flex-wrap items-center justify-end gap-1 w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${rec.gameName} up`}
                    onClick={() => moveUp(rec, idx)}
                    disabled={idx === 0 || updateRec.isPending}
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${rec.gameName} down`}
                    onClick={() => moveDown(rec, idx)}
                    disabled={idx === sorted.length - 1 || updateRec.isPending}
                  >
                    <ChevronDown size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(rec)}>
                    Edit
                  </Button>
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <Link to={`/admin/recommended/${idFromPk(rec.pk)}/edit`}>
                      <PenLine size={12} />
                      {rec.hasPost ? "Edit Post" : "Write Post"}
                    </Link>
                  </Button>
                  {rec.hasPost && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/recommended/${rec.slug ?? rec.pk}`} target="_blank">
                        View →
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(rec)}
                    disabled={deleteRec.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog
          open={showDialog}
          onClose={closeDialog}
          title={editTarget ? "Edit Recommendation" : "Add Recommendation"}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            {!editTarget ? (
              (() => {
                const selectedGame = games.find((g) => g.pk === form.gamePk);
                const filtered = gameSearch.trim()
                  ? games.filter((g) => gameMatchesSearch(g, gameSearch))
                  : games;
                return (
                  <div className="space-y-1">
                    <Input
                      aria-label="Search games"
                      value={gameSearch}
                      onChange={(e) => {
                        setGameSearch(e.target.value);
                        setForm((f) => ({ ...f, gamePk: "" }));
                      }}
                      placeholder="Search games…"
                    />
                    {selectedGame ? (
                      <p className="text-sm text-primary font-medium px-1">✓ {selectedGame.name}</p>
                    ) : gameSearch.trim() ? (
                      <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background divide-y divide-border">
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground px-3 py-2">No games found.</p>
                        ) : (
                          filtered.map((g) => (
                            <button
                              key={g.pk}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                              onClick={() => {
                                setForm((f) => ({ ...f, gamePk: g.pk }));
                                setGameSearch("");
                              }}
                            >
                              {g.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm font-medium">{editTarget.gameName}</p>
            )}
            <textarea
              value={form.blurb}
              onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
              placeholder="Why we love it…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
              required
            />
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma-separated, e.g. Strategy, Party game)"
            />
            <Input
              value={form.bestFor}
              onChange={(e) => setForm((f) => ({ ...f, bestFor: e.target.value }))}
              placeholder="Best for (e.g. 3–5 players)"
            />
            <Input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
              placeholder="Display order"
              min={1}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : editTarget ? "Save Changes" : "Add"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </PageTransition>
  );
}
