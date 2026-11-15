import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, X } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { useGames } from "../hooks/useGames";
import { useAddResult, useUpdateResult } from "../hooks/useResults";
import { getPlayers } from "../lib/api";
import { MAX_PHOTOS, preparePhoto, uploadSessionPhoto } from "../lib/photos";
import { ResultFormSchema } from "../lib/schemas";
import type { Result } from "../lib/types";
import { idFromPk, pluralize } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

export const MOODS = [
  { value: 1, emoji: "😞", label: "Rough night" },
  { value: 2, emoji: "😐", label: "Meh" },
  { value: 3, emoji: "🙂", label: "Good" },
  { value: 4, emoji: "😄", label: "Great" },
  { value: 5, emoji: "🤩", label: "Legendary" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  defaultGameId?: string;
  editResult?: Result;
}

// Mirrors NOTES_MAX_LENGTH in api/routes/results.py
const NOTES_MAX_LENGTH = 1000;

export interface FormState {
  gameId: string;
  gameSearch: string;
  date: string;
  selected: string[];
  winnerId: string;
  scores: Record<string, string>;
  mood: number | null;
  notes: string;
  variables: Record<string, Record<string, string>>;
  seats: Record<string, number | null>;
}

export type Action =
  | { type: "SET_GAME"; gameId: string }
  | { type: "SET_GAME_SEARCH"; value: string; clearGame: boolean }
  | { type: "SET_DATE"; date: string }
  | { type: "TOGGLE_PLAYER"; playerId: string }
  | { type: "SET_WINNER"; playerId: string }
  | { type: "SET_SCORE"; playerId: string; value: string }
  | { type: "SET_MOOD"; mood: number | null }
  | { type: "SET_NOTES"; notes: string }
  | { type: "SET_VARIABLE"; playerId: string; variableId: string; value: string }
  | { type: "SET_SEAT"; playerId: string; seat: number | null }
  | { type: "RESET"; init: { defaultGameId?: string; editResult?: Result } };

export function buildInitialState(init: {
  defaultGameId?: string;
  editResult?: Result;
}): FormState {
  const { defaultGameId, editResult: r } = init;
  if (r) {
    return {
      gameId: r.gameId,
      gameSearch: "",
      date: r.date,
      selected: r.players.map((p) => p.playerId),
      winnerId: r.winnerId,
      scores: Object.fromEntries(
        r.players.filter((p) => p.score != null).map((p) => [p.playerId, String(p.score)]),
      ),
      mood: r.mood ?? null,
      notes: r.notes ?? "",
      variables: Object.fromEntries(r.players.map((p) => [p.playerId, p.variables ?? {}])),
      seats: Object.fromEntries(r.players.map((p) => [p.playerId, p.seat ?? null])),
    };
  }
  return {
    gameId: defaultGameId ?? "",
    gameSearch: "",
    date: new Date().toISOString().slice(0, 10),
    selected: [],
    winnerId: "",
    scores: {},
    mood: null,
    notes: "",
    variables: {},
    seats: {},
  };
}

export function formReducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case "SET_GAME":
      return { ...state, gameId: action.gameId, gameSearch: "", variables: {}, seats: {} };

    case "SET_GAME_SEARCH":
      return { ...state, gameSearch: action.value, gameId: action.clearGame ? "" : state.gameId };

    case "SET_DATE":
      return { ...state, date: action.date };

    case "TOGGLE_PLAYER": {
      const inList = state.selected.includes(action.playerId);
      const selected = inList
        ? state.selected.filter((id) => id !== action.playerId)
        : [...state.selected, action.playerId];
      const winnerId = inList && state.winnerId === action.playerId ? "" : state.winnerId;
      let scores = state.scores;
      if (inList && action.playerId in scores) {
        scores = { ...scores };
        delete scores[action.playerId];
      }
      let variables = state.variables;
      let seats = state.seats;
      if (inList) {
        variables = { ...variables };
        delete variables[action.playerId];
        seats = { ...seats };
        delete seats[action.playerId];
      }
      return { ...state, selected, winnerId, scores, variables, seats };
    }

    case "SET_WINNER":
      return { ...state, winnerId: action.playerId };

    case "SET_SCORE":
      return { ...state, scores: { ...state.scores, [action.playerId]: action.value } };

    case "SET_MOOD":
      return { ...state, mood: action.mood };

    case "SET_NOTES":
      return { ...state, notes: action.notes };

    case "SET_VARIABLE":
      return {
        ...state,
        variables: {
          ...state.variables,
          [action.playerId]: {
            ...state.variables[action.playerId],
            [action.variableId]: action.value,
          },
        },
      };

    case "SET_SEAT":
      return { ...state, seats: { ...state.seats, [action.playerId]: action.seat } };

    case "RESET":
      return buildInitialState(action.init);

    default:
      return state;
  }
}

export function LogResultDialog({ open, onClose, defaultGameId, editResult }: Props) {
  const { data: games = [] } = useGames();
  // Mounted once per game card: only fetch players once the dialog is opened.
  const { data: users = [] } = useQuery({
    queryKey: ["players"],
    queryFn: getPlayers,
    enabled: open,
  });
  const addResult = useAddResult();
  const updateResultMut = useUpdateResult();
  const qc = useQueryClient();

  const [state, dispatch] = useReducer(
    formReducer,
    { defaultGameId, editResult },
    buildInitialState,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Photo blobs are not serialisable form state: kept out of the reducer.
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const photoInputId = useId();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const gameSearchId = useId();
  const notesId = useId();

  useLayoutEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      dispatch({ type: "RESET", init: { defaultGameId, editResult } });
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    }
  }, [open, editResult?.pk, editResult, defaultGameId]);

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    e.target.value = "";
    try {
      const blobs = await Promise.all(files.map(preparePhoto));
      setPhotos((prev) => [
        ...prev,
        ...blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })),
      ]);
    } catch {
      setErrors((prev) => ({ ...prev, photos: "Could not read one of those images" }));
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  const guardedClose = () => {
    if (!uploading) onClose();
  };

  const filteredGames = useMemo(
    () => games.filter((g) => g.name.toLowerCase().includes(state.gameSearch.toLowerCase())),
    [games, state.gameSearch],
  );

  const selectedGame = games.find((g) => idFromPk(g.pk) === state.gameId);
  const playerVariables = selectedGame?.playerVariables ?? [];
  const trackTurnOrder = selectedGame?.trackTurnOrder ?? false;

  const handleSubmit = async () => {
    const validation = ResultFormSchema.safeParse({
      gameId: state.gameId,
      date: state.date,
      players: state.selected,
      winnerId: state.winnerId,
    });

    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        if (!newErrors[field]) newErrors[field] = issue.message;
      });
      setErrors(newErrors);
      return;
    }

    if (playerVariables.length > 0) {
      const missing = state.selected.some((username) =>
        playerVariables.some((v) => !state.variables[username]?.[v.id]),
      );
      if (missing) {
        setErrors({ variables: "Select a value for every player variable" });
        return;
      }
    }

    if (trackTurnOrder) {
      const n = state.selected.length;
      const seats = state.selected.map((username) => state.seats[username]);
      const valid =
        seats.every((s) => s != null) &&
        new Set(seats).size === n &&
        seats.every((s) => s! >= 1 && s! <= n);
      if (!valid) {
        setErrors({ seats: `Assign a unique seat (1-${n}) to every player` });
        return;
      }
    }
    setErrors({});

    const game = games.find((g) => idFromPk(g.pk) === state.gameId);
    const winner = users.find((u) => u.pk === state.winnerId);

    if (!game || !winner) {
      console.error("Game or winner not found in data arrays");
      return;
    }

    const notes = state.notes.trim();
    const payload = {
      gameId: state.gameId,
      gameName: game.name,
      date: state.date,
      players: state.selected.map((username) => {
        const u = users.find((u) => u.pk === username)!;
        const score = parseFloat(state.scores[username] ?? "");
        return {
          playerId: username,
          playerName: u.displayName,
          ...(Number.isNaN(score) ? {} : { score }),
          ...(playerVariables.length > 0
            ? {
                variables: Object.fromEntries(
                  playerVariables.map((v) => [v.id, state.variables[username]?.[v.id] ?? ""]),
                ),
              }
            : {}),
          ...(trackTurnOrder ? { seat: state.seats[username] } : {}),
        };
      }),
      winnerId: state.winnerId,
      winnerName: winner.displayName,
      ...(state.mood != null ? { mood: state.mood } : {}),
      ...(notes ? { notes } : {}),
    };

    let createdPk: string | undefined;
    try {
      if (editResult) {
        await updateResultMut.mutateAsync({
          id: editResult.pk,
          // explicit null clears a previously-set mood/notes on the server
          data: { ...payload, mood: state.mood ?? null, notes: notes || null },
        });
      } else {
        createdPk = (await addResult.mutateAsync(payload)).pk;
      }
    } catch (err) {
      // The dialog stays open on failure, and it sits in the top layer — a
      // toast would render behind the backdrop, so say it here instead.
      setErrors({ submit: err instanceof Error ? err.message : "Could not save this session" });
      return;
    }

    let failed = 0;
    if (createdPk && photos.length > 0) {
      setUploading(true);
      const outcomes = await Promise.allSettled(
        photos.map((p) => uploadSessionPhoto(createdPk!, p.blob)),
      );
      failed = outcomes.filter((o) => o.status === "rejected").length;
      setUploading(false);
      qc.invalidateQueries({ queryKey: ["reactions"] });
    }
    onClose();
    dispatch({ type: "RESET", init: { defaultGameId, editResult } });
    if (failed > 0) {
      // After onClose(): the dialog is gone, so the toast is visible.
      toast.error(
        `Result saved — ${pluralize(failed, "photo")} failed to upload. Add ${failed === 1 ? "it" : "them"} from the game night card.`,
      );
    }
  };

  return (
    <Dialog open={open} onClose={guardedClose} title={editResult ? "Edit session" : "Log session"}>
      <div className="space-y-4">
        <div>
          <label htmlFor={gameSearchId} className="text-sm font-medium">
            Game
          </label>
          <Input
            id={gameSearchId}
            ref={searchInputRef}
            placeholder="Search games…"
            value={state.gameSearch}
            onChange={(e) => {
              const val = e.target.value;
              const clearGame = !games.some(
                (g) =>
                  g.name.toLowerCase().includes(val.toLowerCase()) &&
                  idFromPk(g.pk) === state.gameId,
              );
              dispatch({ type: "SET_GAME_SEARCH", value: val, clearGame: clearGame });
            }}
            className="mt-1 mb-1"
          />
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={state.gameId}
            onChange={(e) => dispatch({ type: "SET_GAME", gameId: e.target.value })}
            size={
              filteredGames.length > 0 && state.gameSearch
                ? Math.min(filteredGames.length, 5)
                : undefined
            }
          >
            <option value="">Select a game…</option>
            {filteredGames.map((g) => (
              <option key={g.pk} value={idFromPk(g.pk)}>
                {g.name}
              </option>
            ))}
          </select>
          {errors.gameId && <p className="text-destructive text-xs mt-1">{errors.gameId}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={state.date}
            onChange={(e) => dispatch({ type: "SET_DATE", date: e.target.value })}
          />

          {errors.date && <p className="text-destructive text-xs mt-1">{errors.date}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Players</label>
          {users.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">No registered users found.</p>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {users.map((u) => {
              const isSelected = state.selected.includes(u.pk);
              return (
                <button
                  key={u.pk}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => dispatch({ type: "TOGGLE_PLAYER", playerId: u.pk })}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-all duration-200 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary scale-105 shadow-xs shadow-primary/20"
                      : "bg-background hover:bg-accent border-input hover:border-primary/30"
                  }`}
                >
                  <span
                    className={`overflow-hidden transition-all duration-200 ${isSelected ? "w-3" : "w-0"}`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {u.displayName}
                </button>
              );
            })}
          </div>

          {errors.players && <p className="text-destructive text-xs mt-1">{errors.players}</p>}
        </div>
        {state.selected.length > 0 && (
          <div>
            <label className="text-sm font-medium">Scores (optional)</label>
            <div className="mt-1 space-y-2">
              {state.selected.map((username) => {
                const u = users.find((u) => u.pk === username)!;
                return (
                  <div key={username} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{u.displayName}</span>
                    <Input
                      type="number"
                      step="any"
                      placeholder="Score"
                      className="w-24"
                      value={state.scores[username] ?? ""}
                      onChange={(e) =>
                        dispatch({ type: "SET_SCORE", playerId: username, value: e.target.value })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {state.selected.length > 0 && playerVariables.length > 0 && (
          <div className="space-y-3">
            {playerVariables.map((v) => (
              <div key={v.id}>
                <label className="text-sm font-medium">{v.label}</label>
                <div className="mt-1 space-y-2">
                  {state.selected.map((username) => {
                    const u = users.find((u) => u.pk === username)!;
                    return (
                      <div key={username} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{u.displayName}</span>
                        <select
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={state.variables[username]?.[v.id] ?? ""}
                          onChange={(e) =>
                            dispatch({
                              type: "SET_VARIABLE",
                              playerId: username,
                              variableId: v.id,
                              value: e.target.value,
                            })
                          }
                        >
                          <option value="">Select…</option>
                          {v.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {errors.variables && (
              <p className="text-destructive text-xs mt-1">{errors.variables}</p>
            )}
          </div>
        )}
        {state.selected.length > 0 && trackTurnOrder && (
          <div>
            <label className="text-sm font-medium">Seat order (1 = went first)</label>
            <div className="mt-1 space-y-2">
              {state.selected.map((username) => {
                const u = users.find((u) => u.pk === username)!;
                return (
                  <div key={username} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{u.displayName}</span>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      value={state.seats[username] ?? ""}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_SEAT",
                          playerId: username,
                          seat: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Select…</option>
                      {state.selected.map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {errors.seats && <p className="text-destructive text-xs mt-1">{errors.seats}</p>}
          </div>
        )}
        {state.selected.length > 0 && (
          <div>
            <label className="text-sm font-medium">Mood (optional)</label>
            <div className="mt-1 flex gap-2">
              {MOODS.map(({ value, emoji, label }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() =>
                    dispatch({ type: "SET_MOOD", mood: state.mood === value ? null : value })
                  }
                  className={`text-2xl p-1.5 rounded-lg border transition-all ${
                    state.mood === value
                      ? "border-primary bg-primary/10 scale-110"
                      : "border-transparent opacity-50 hover:opacity-100"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.selected.length > 0 && (
          <div>
            <label htmlFor={notesId} className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              id={notesId}
              value={state.notes}
              onChange={(e) => dispatch({ type: "SET_NOTES", notes: e.target.value })}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="e.g. score breakdown: birds 34, bonus cards 8, eggs 12"
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
            />
          </div>
        )}
        {state.selected.length > 0 && (
          <div>
            <label className="text-sm font-medium">Winner</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={state.winnerId}
              onChange={(e) => dispatch({ type: "SET_WINNER", playerId: e.target.value })}
            >
              <option value="">Select winner…</option>
              {state.selected.map((username) => {
                const u = users.find((u) => u.pk === username)!;
                return (
                  <option key={username} value={username}>
                    {u.displayName}
                  </option>
                );
              })}
            </select>

            {errors.winnerId && <p className="text-destructive text-xs mt-1">{errors.winnerId}</p>}
          </div>
        )}
        {!editResult && (
          <div>
            <label htmlFor={photoInputId} className="text-sm font-medium">
              Photos (optional, up to {MAX_PHOTOS})
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={p.url} className="relative size-16">
                  <img
                    src={p.url}
                    alt={`Selected photo ${i + 1}`}
                    className="size-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => removePhoto(i)}
                    className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border bg-card"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <span className="grid size-16 place-items-center rounded-md border border-dashed text-muted-foreground">
                  <ImagePlus size={18} aria-hidden="true" />
                </span>
              )}
            </div>
            <input
              id={photoInputId}
              type="file"
              accept="image/*"
              multiple
              disabled={photos.length >= MAX_PHOTOS || uploading}
              onChange={handlePhotoPick}
              className="mt-2 block text-sm"
            />
            {errors.photos && <p className="text-destructive text-xs mt-1">{errors.photos}</p>}
          </div>
        )}
        {errors.submit && (
          <p role="alert" className="text-destructive text-sm">
            {errors.submit}
          </p>
        )}
        <Button
          className="w-full"
          isLoading={(editResult ? updateResultMut.isPending : addResult.isPending) || uploading}
          onClick={handleSubmit}
        >
          {editResult ? "Save changes" : "Log session"}
        </Button>
      </div>
    </Dialog>
  );
}
