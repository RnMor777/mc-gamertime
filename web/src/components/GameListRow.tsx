import { CalendarDays, Clock, Gauge, PenLine, Trash2, Users2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import type { Game } from "../lib/types";
import { cn, idFromPk, pressable } from "../lib/utils";
import { getGameCategories } from "./CategorySelect";
import { LogResultDialog } from "./LogResultDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface Props {
  game: Game;
  onSelect?: (game: Game) => void;
  onDelete?: (id: string) => void;
  isNew?: boolean;
}

export function GameListRow({ game, onSelect, onDelete, isNew }: Props) {
  const gameId = idFromPk(game.pk);
  const bggUrl = game.bggId ? `https://boardgamegeek.com/boardgame/${game.bggId}` : undefined;
  const { user } = useAuth();
  const [showLogDialog, setShowLogDialog] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 hover:shadow-xs transition-all duration-200",
        onSelect && "cursor-pointer",
        pressable,
      )}
      onClick={onSelect ? () => onSelect(game) : undefined}
    >
      {bggUrl ? (
        <a
          href={bggUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          {game.imageUrl ? (
            <img
              src={game.imageUrl}
              alt={game.name}
              className="w-14 h-14 object-cover rounded-md"
            />
          ) : (
            <div className="w-14 h-14 bg-muted rounded-md flex items-center justify-center text-xl opacity-30">
              🎲
            </div>
          )}
        </a>
      ) : (
        <div className="shrink-0">
          {game.imageUrl ? (
            <img
              src={game.imageUrl}
              alt={game.name}
              className="w-14 h-14 object-cover rounded-md"
            />
          ) : (
            <div className="w-14 h-14 bg-muted rounded-md flex items-center justify-center text-xl opacity-30">
              🎲
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {onSelect ? (
            <span className="font-display font-semibold text-sm">{game.name}</span>
          ) : (
            <Link
              to={`/games/${gameId}`}
              className="font-display font-semibold text-sm hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {game.name}
            </Link>
          )}
          {isNew && <Badge className="px-1.5 py-0 text-[10px] font-semibold">New</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
          {game.minPlayers != null && game.maxPlayers != null && (
            <span className="flex items-center gap-1">
              <Users2 size={11} />
              {game.minPlayers}–{game.maxPlayers}p
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
        </div>
        {getGameCategories(game).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {getGameCategories(game)
              .slice(0, 3)
              .map((cat) => (
                <Badge
                  key={cat}
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-normal"
                >
                  {cat}
                </Badge>
              ))}
            {getGameCategories(game).length > 3 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                +{getGameCategories(game).length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
      {!onSelect && user && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setShowLogDialog(true);
          }}
        >
          <PenLine size={14} />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(gameId);
          }}
        >
          <Trash2 size={14} />
        </Button>
      )}
      <LogResultDialog
        open={showLogDialog}
        onClose={() => setShowLogDialog(false)}
        defaultGameId={gameId}
      />
    </div>
  );
}
