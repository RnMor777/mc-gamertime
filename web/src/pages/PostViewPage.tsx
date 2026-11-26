import { ChevronLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { SafeHtml } from "../components/SafeHtml";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useDeletePost, usePosts } from "../hooks/usePosts";
import { useResults } from "../hooks/useResults";
import { useAuth } from "../lib/AuthContext";
import { formatDate, formatWinners, getWinnerIds, idFromPk } from "../lib/utils";

export default function PostViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: posts = [], isLoading: pL } = usePosts();
  const { data: results = [], isLoading: rL } = useResults();
  const deletePost = useDeletePost();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (pL || rL)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );

  const post = posts.find((p) => idFromPk(p.pk) === id);
  if (!post)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 text-center py-20 text-muted-foreground">
        <p>Post not found.</p>
        <Link to="/posts" className="text-primary hover:underline mt-2 block">
          ← Posts
        </Link>
      </div>
    );

  const session = results.find((r) => r.pk === post.sessionPk);
  const gameId = post.gamePk ? idFromPk(post.gamePk) : null;

  async function handleDelete() {
    if (!window.confirm("Delete this post?")) return;
    await deletePost.mutateAsync(id!);
    navigate("/posts");
  }

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
        <div>
          <h1 className="text-2xl font-display font-bold mb-2">{post.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {gameId && post.gameName && (
              <Link to={`/games/${gameId}`}>
                <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                  {post.gameName}
                </Badge>
              </Link>
            )}
            <span>{formatDate(post.createdAt)}</span>
            <span>by {post.authorName}</span>
          </div>
        </div>
        {session && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
            <div className="font-medium text-muted-foreground uppercase tracking-wide text-xs mb-2">
              Session
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span> {formatDate(session.date)}
            </div>
            <div>
              <span className="text-muted-foreground">Players:</span>{" "}
              {session.players.map((p) => p.playerName).join(", ")}
            </div>
            <div>
              <span className="text-muted-foreground">
                {getWinnerIds(session).length > 1 ? "Winners:" : "Winner:"}
              </span>{" "}
              <span className="font-medium">{formatWinners(session)}</span>
            </div>
          </div>
        )}
        <SafeHtml
          html={post.content}
          className="prose prose-sm prose-invert max-w-none [--tw-prose-invert-body:var(--color-foreground)]"
        />
        {user?.role === "admin" && (
          <div className="flex gap-2 pt-4 border-t">
            <Button asChild variant="outline" size="sm">
              <Link to={`/posts/${id}/edit`}>Edit</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deletePost.isPending}
            >
              {deletePost.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
