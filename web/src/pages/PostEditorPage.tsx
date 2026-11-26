import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { TiptapEditor } from "../components/TiptapEditor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { type PostDraft, useDraft } from "../hooks/useDraft";
import { useCreatePost, usePosts, useUpdatePost } from "../hooks/usePosts";
import { useResults } from "../hooks/useResults";
import { formatDate, formatWinners, idFromPk } from "../lib/utils";

export default function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { data: posts = [], isLoading: pL } = usePosts();
  const { data: results = [], isLoading: rL } = useResults();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const [searchParams] = useSearchParams();
  const existing = isEdit ? posts.find((p) => idFromPk(p.pk) === id) : undefined;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sessionPk, setSessionPk] = useState(() => searchParams.get("session") ?? "");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [draftToRestore, setDraftToRestore] = useState<PostDraft | null>(null);

  const {
    load: loadDraft,
    save: saveDraft,
    clear: clearDraft,
  } = useDraft(`post-draft:${id ?? "new"}`);

  useEffect(() => {
    if (isEdit) {
      if (existing && !ready) {
        setTitle(existing.title);
        setContent(existing.content);
        setSessionPk(existing.sessionPk ?? "");
        const draft = loadDraft();
        if (draft && draft.content !== existing.content) {
          setDraftToRestore(draft);
        }
        setReady(true);
      }
    } else {
      const draft = loadDraft();
      if (draft?.content && draft.content !== "<p></p>") {
        setDraftToRestore(draft);
      }
      setReady(true);
    }
  }, [existing?.pk, isEdit, existing, ready, loadDraft]);

  useEffect(() => {
    if (!ready || draftToRestore) return;
    const timer = setTimeout(() => {
      saveDraft({ title, content, sessionPk });
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content, sessionPk, ready, draftToRestore, saveDraft]);

  if (pL || rL || !ready)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const sortedResults = [...results].sort((a, b) => b.date.localeCompare(a.date));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!sessionPk) {
      setError("Please select a session.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!content.trim() || content === "<p></p>") {
      setError("Content is required.");
      return;
    }
    const session = results.find((r) => r.pk === sessionPk);
    if (!session) {
      setError("Selected session not found.");
      return;
    }
    const payload = {
      title: title.trim(),
      content,
      sessionPk,
      gameName: session.gameName,
      gamePk: session.gameId,
      authorName: "",
    };
    try {
      if (isEdit && id) {
        await updatePost.mutateAsync({ id, data: payload });
        clearDraft();
        navigate(`/posts/${id}`);
      } else {
        const created = await createPost.mutateAsync(payload);
        clearDraft();
        navigate(`/posts/${idFromPk(created.pk)}`);
      }
    } catch {
      setError("Failed to save post. Please try again.");
    }
  }

  const isPending = createPost.isPending || updatePost.isPending;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <Link
          to="/posts"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
        >
          <ChevronLeft size={16} />
          Posts
        </Link>
        <h1 className="text-2xl font-display font-bold">{isEdit ? "Edit Post" : "New Post"}</h1>
        {draftToRestore && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
              Unsaved draft found from {new Date(draftToRestore.savedAt).toLocaleString()} — restore
              it?
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTitle(draftToRestore.title);
                  setContent(draftToRestore.content);
                  setSessionPk(draftToRestore.sessionPk);
                  setEditorKey((k) => k + 1);
                  setDraftToRestore(null);
                }}
              >
                Restore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearDraft();
                  setDraftToRestore(null);
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="post-session" className="text-sm font-medium mb-1.5 block">
              Session *
            </label>
            <select
              id="post-session"
              value={sessionPk}
              onChange={(e) => setSessionPk(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
            >
              <option value="">Select a session…</option>
              {sortedResults.map((r) => (
                <option key={r.pk} value={r.pk}>
                  {r.gameName} · {formatDate(r.date)} · {formatWinners(r)} won
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="post-title" className="text-sm font-medium mb-1.5 block">
              Title *
            </label>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title…"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Content *</label>
            <TiptapEditor key={editorKey} content={content} onChange={setContent} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save Changes" : "Publish"}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/posts">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
