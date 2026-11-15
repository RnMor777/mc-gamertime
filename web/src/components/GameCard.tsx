import {
  CalendarDays,
  Clock,
  Dices,
  ExternalLink,
  Gamepad2,
  Gauge,
  PenLine,
  Star,
  Trash2,
  Users2,
} from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { LogResultDialog } from "../components/LogResultDialog.tsx";
import { Dialog } from "../components/ui/dialog";
import { useAuth } from "../lib/AuthContext";
import { addGameFavorite, removeGameFavorite } from "../lib/api";
import type { Game } from "../lib/types";
import { cn, formatDate, idFromPk, pluralize, pressable } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip.tsx";

interface Props {
  game: Game;
  handleDelete?: (id: string) => void;
  playCounts?: number;
  lastPlayed?: string;
  isNew?: boolean;
}

// Icon buttons floating over the cover: one size so they line up, always visible on touch
// screens, revealed on hover from `sm` up.
const overlayButton =
  "flex h-8 w-8 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200";

export const GameCard = memo(function GameCard({
  game,
  handleDelete,
  playCounts,
  lastPlayed,
  isNew,
}: Props) {
  const gameId = idFromPk(game.pk);
  const bggUrl = game.bggId ? `https://boardgamegeek.com/boardgame/${game.bggId}` : undefined;

  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState("");
  const [showLogDialog, setShowLogDialog] = useState(false);

  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(() => game.isFavorited ?? false);

  function closeDialog() {
    setShowDialog(false);
    setError("");
  }

  async function toggleFavorite(e: React.MouseEvent) {
    e.stopPropagation(); // prevent card link from firing

    try {
      if (isFavorited) {
        await removeGameFavorite(gameId);
        setIsFavorited(false);
      }
      if (!isFavorited) {
        await addGameFavorite(gameId);
        setIsFavorited(true);
      }
    } catch {
      setError("Failed to update favourite");
    }
  }

  const imageContent = game.imageUrl ? (
    <img src={game.imageUrl} alt={game.name} className="w-full h-40 object-contain bg-muted" />
  ) : (
    <div className="w-full h-40 bg-muted flex items-center justify-center text-muted-foreground">
      <Dices size={40} className="opacity-40" aria-hidden="true" />
    </div>
  );

  return (
    <div
      className={cn(
        "bg-card rounded-lg border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group",
        pressable,
      )}
    >
      <div className="relative">
        {isNew && (
          <Badge
            className="absolute bottom-2 left-2 z-10 px-2 py-0.5 text-xs font-semibold shadow-xs"
            title={game.createdAt ? `Added ${formatDate(game.createdAt.slice(0, 10))}` : "New"}
          >
            New
          </Badge>
        )}
        {playCounts && playCounts > 0 && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 text-xs text-white bg-black/60 border-none backdrop-blur-xs cursor-help transition-transform hover:scale-105"
            title={lastPlayed ? `Last played ${formatDate(lastPlayed)}` : "Never played"}
          >
            <Gamepad2 size={12} className="opacity-80" />
            <span>Played {pluralize(playCounts, "time")}</span>
          </Badge>
        )}
        {/* The cover opens the in-app game page; the BGG link lives in the card body. */}
        <Link to={`/games/${gameId}`} tabIndex={-1} aria-hidden="true">
          {imageContent}
        </Link>
        {game.imageUrl && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent pointer-events-none" />
        )}
        {handleDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDialog(true);
            }}
            className={cn(
              overlayButton,
              "absolute top-2 left-2 z-10 text-white/70 hover:text-red-400",
            )}
            title="Remove game"
            aria-label={`Remove ${game.name}`}
          >
            <Trash2 size={14} />
          </button>
        )}

        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
          {user && (
            <button
              onClick={toggleFavorite}
              className={cn(
                overlayButton,
                isFavorited ? "text-yellow-400 sm:opacity-100" : "text-white/70",
              )}
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
              aria-label={isFavorited ? `Unfavorite ${game.name}` : `Favorite ${game.name}`}
              aria-pressed={isFavorited}
            >
              <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
            </button>
          )}
          {user && (
            <button
              onClick={() => setShowLogDialog(true)}
              className={cn(overlayButton, "text-white/70 hover:text-blue-300")}
              title="Log a session"
              aria-label={`Log a session of ${game.name}`}
            >
              <PenLine size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="p-3">
        <Link
          to={`/games/${gameId}`}
          className="font-display font-semibold text-sm leading-tight mb-2 hover:text-primary transition-colors block"
        >
          {game.name}
        </Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-xs text-muted-foreground">
          {game.minPlayers != null && game.maxPlayers != null && (
            <Badge variant="secondary" className="flex items-center gap-1 px-1.5 py-0 text-[10px]">
              <Users2 size={11} />
              {game.minPlayers}–{game.maxPlayers}
            </Badge>
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
              <Tooltip text="Complexity rating (1-5). Higher means more rules and deeper strategy." />
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
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-2"
            >
              <ExternalLink size={11} />
              BGG
            </a>
          )}
        </div>
        <Dialog open={showDialog} onClose={closeDialog} title="Delete Game">
          <div className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground">
                Are you sure you want to remove{" "}
                <span className="font-medium text-foreground">{game.name}</span> from your
                collection? This action cannot be undone.
              </p>
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (handleDelete) handleDelete(gameId);
                  closeDialog();
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </Dialog>

        <LogResultDialog
          open={showLogDialog}
          onClose={() => setShowLogDialog(false)}
          defaultGameId={gameId}
        />
      </div>
    </div>
  );
});
