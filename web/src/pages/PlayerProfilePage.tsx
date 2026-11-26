import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Camera,
  ChevronLeft,
  Crown,
  Dices,
  Flame,
  Gamepad2,
  Heart,
  PartyPopper,
  Smile,
  Sparkles,
  Star,
  Swords,
  Trophy,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AchievementBadge } from "../components/AchievementBadge";
import { Avatar } from "../components/Avatar";
import { PageTransition } from "../components/PageTransition";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { WinRateTrendChart } from "../components/WinRateTrendChart";
import { WrappedOverlay, type WrappedSlide } from "../components/WrappedOverlay";
import { useCountUp } from "../hooks/useCountUp";
import { useGames } from "../hooks/useGames";
import { usePlayerStats } from "../hooks/usePlayerStats";
import { usePlayers } from "../hooks/usePlayers";
import { useResults } from "../hooks/useResults";
import { useStats } from "../hooks/useStats";
import { useAuth } from "../lib/AuthContext";
import { deleteAvatar, uploadAvatar } from "../lib/api";
import type { Player } from "../lib/types";
import {
  colorForName,
  formatDate,
  getWinnerIds,
  idFromPk,
  isResultWinner,
  pluralize,
} from "../lib/utils";

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: players = [] } = usePlayers();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);

  const playerAvatar = players.find((p) => p.pk === id);
  const avatarUrl = playerAvatar?.avatarUrl ?? undefined;
  const canEdit = !!user && (user.sub === id || user.role === "admin");

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    // Create instant local preview URL
    const localUrl = URL.createObjectURL(file);

    // Optimistically update global cache so Header and Profile sync
    const previousPlayers = queryClient.getQueryData<Player[]>(["players"]);
    if (previousPlayers) {
      queryClient.setQueryData(
        ["players"],
        previousPlayers.map((p) => (p.pk === id ? { ...p, avatarUrl: localUrl } : p)),
      );
    }

    setUploading(true);
    try {
      await uploadAvatar(id, file);
      // Success: Invalidate to get the real CDN URL (though it might look the same)
      await queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Photo updated");
    } catch {
      // Revert on failure
      if (previousPlayers) queryClient.setQueryData(["players"], previousPlayers);
      toast.error("Failed to update photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      URL.revokeObjectURL(localUrl);
    }
  }

  async function handleRemovePhoto() {
    if (!id) return;

    const previousPlayers = queryClient.getQueryData<Player[]>(["players"]);
    if (previousPlayers) {
      queryClient.setQueryData(
        ["players"],
        previousPlayers.map((p) => (p.pk === id ? { ...p, avatarUrl: undefined } : p)),
      );
    }

    setUploading(true);
    try {
      await deleteAvatar(id);
      await queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Photo removed");
    } catch {
      if (previousPlayers) queryClient.setQueryData(["players"], previousPlayers);
      toast.error("Failed to remove photo");
    } finally {
      setUploading(false);
    }
  }

  const { data: playerStats } = usePlayerStats(id);
  const { data: results = [], isLoading: rL } = useResults();
  const { data: games = [], isLoading: gL } = useGames();
  const { data: stats } = useStats();

  const myResults = results.filter((r) => r.players.some((p) => p.playerId === id));
  const playerName = myResults[0]?.players.find((p) => p.playerId === id)?.playerName ?? "Unknown";

  const wins = myResults.filter((r) => isResultWinner(r, id)).length;
  const played = myResults.length;
  const winRate = played > 0 ? wins / played : 0;

  const chronological = [...myResults].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0,
    streakBest = 0;
  for (const r of chronological) {
    if (isResultWinner(r, id)) {
      streak++;
      if (streak > streakBest) streakBest = streak;
    } else streak = 0;
  }
  const streakCurrent = streak;

  const countPlayed = useCountUp(played);
  const countWins = useCountUp(wins);
  const countWinRatePct = useCountUp(Math.round(winRate * 100));
  const countStreakCurrent = useCountUp(streakCurrent);
  const countStreakBest = useCountUp(streakBest);

  if (rL || gL)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );

  if (myResults.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 text-center py-20 text-muted-foreground">
        <p>Player not found or no sessions yet.</p>
        <Link to="/leaderboard" className="text-primary hover:underline mt-2 block">
          ← Leaderboard
        </Link>
      </div>
    );

  const gameCounts: Record<string, { name: string; count: number }> = {};
  const gameWins: Record<string, { name: string; wins: number; played: number }> = {};
  for (const r of myResults) {
    if (!gameCounts[r.gameId]) gameCounts[r.gameId] = { name: r.gameName, count: 0 };
    gameCounts[r.gameId].count++;
    if (!gameWins[r.gameId]) gameWins[r.gameId] = { name: r.gameName, wins: 0, played: 0 };
    gameWins[r.gameId].played++;
    if (isResultWinner(r, id)) gameWins[r.gameId].wins++;
  }

  const favoriteGame = Object.values(gameCounts).sort((a, b) => b.count - a.count)[0];
  const bestGame = Object.values(gameWins)
    .filter((g) => g.played >= 3)
    .sort((a, b) => b.wins / b.played - a.wins / a.played)[0];

  const h2h: Record<string, { name: string; theirWins: number; myWins: number; shared: number }> =
    {};
  for (const r of myResults) {
    const iWon = isResultWinner(r, id);
    for (const p of r.players) {
      if (p.playerId === id || p.isGuest) continue;
      if (!h2h[p.playerId])
        h2h[p.playerId] = { name: p.playerName, theirWins: 0, myWins: 0, shared: 0 };
      h2h[p.playerId].shared++;
      const theyWon = isResultWinner(r, p.playerId);
      if (theyWon && !iWon) h2h[p.playerId].theirWins++;
      if (iWon && !theyWon) h2h[p.playerId].myWins++;
    }
  }
  const nemesis = Object.entries(h2h)
    .filter(([, v]) => v.shared >= 2)
    .sort((a, b) => b[1].theirWins - a[1].theirWins)[0];
  const friendlyRival = Object.entries(h2h)
    .filter(([, v]) => v.shared >= 2 && v.myWins > 0)
    .sort((a, b) => b[1].myWins - a[1].myWins)[0];

  const moodValues = myResults.map((r) => r.mood).filter((m): m is number => m != null);
  const avgMood =
    moodValues.length > 0 ? moodValues.reduce((a, b) => a + b, 0) / moodValues.length : undefined;

  const myRatingEntry = stats?.leaderboard.find((e) => e.playerId === id);
  const myRank = stats ? stats.leaderboard.findIndex((e) => e.playerId === id) + 1 : 0;
  const earnedAchievements = playerStats?.achievements.filter((a) => a.earnedAt != null) ?? [];

  const wrappedSlides: WrappedSlide[] = [
    {
      key: "intro",
      icon: <Sparkles size={40} />,
      title: `Your Year, ${playerName}`,
      value: "",
      sub: "Let's take a look back",
    },
    {
      key: "sessions",
      icon: <Dices size={40} />,
      title: "Game Nights",
      value: played,
      sub: `session${played === 1 ? "" : "s"} logged`,
    },
    {
      key: "favorite",
      icon: <Gamepad2 size={40} />,
      title: "Your Go-To Game",
      value: favoriteGame.name,
      sub: `${favoriteGame.count} play${favoriteGame.count === 1 ? "" : "s"}`,
    },
    ...(nemesis
      ? [
          {
            key: "nemesis",
            icon: <Swords size={40} />,
            title: "Your Nemesis",
            value: nemesis[1].name,
            sub: `${nemesis[1].theirWins}-${nemesis[1].myWins} head to head`,
          },
        ]
      : []),
    ...(streakBest > 0
      ? [
          {
            key: "streak",
            icon: <Flame size={40} />,
            title: "Best Streak",
            value: streakBest,
            sub: "wins in a row",
          },
        ]
      : []),
    ...(avgMood !== undefined
      ? [
          {
            key: "mood",
            icon: <Smile size={40} />,
            title: "Vibe Check",
            value: ["😞", "🙁", "😐", "🙂", "🤩"][
              Math.min(4, Math.max(0, Math.round(avgMood) - 1))
            ],
            sub: `avg mood ${avgMood.toFixed(1)} / 5`,
          },
        ]
      : []),
    ...(myRatingEntry
      ? [
          {
            key: "rating",
            icon: <Trophy size={40} />,
            title: "Your Rating",
            value: myRatingEntry.rating,
            sub: `#${myRank} of ${stats?.leaderboard.length}`,
          },
        ]
      : []),
    ...(playerStats
      ? [
          {
            key: "achievements",
            icon: <Award size={40} />,
            title: "Badges Earned",
            value: earnedAchievements.length,
            sub: `of ${playerStats.achievements.length} total`,
          },
        ]
      : []),
    {
      key: "outro",
      icon: <PartyPopper size={40} />,
      title: "That's a Wrap! 🎉",
      value: "",
      sub: "Tap right or press Esc to close",
    },
  ];

  const recent = [...myResults].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  function gameLink(gameId: string) {
    const g = games.find((g) => idFromPk(g.pk) === gameId || g.pk === gameId);
    return g ? idFromPk(g.pk) : gameId;
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-8">
        {/* ── Hero card ── */}
        <div
          className="rounded-xl border bg-card overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 120% 160% at 50% -10%, hsl(var(--primary) / 0.18) 0%, transparent 60%), hsl(var(--card))",
          }}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <Link
                to="/leaderboard"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
              >
                <ChevronLeft size={16} />
                Leaderboard
              </Link>
              {canEdit && (
                <button
                  onClick={() => setWrappedOpen(true)}
                  className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <Sparkles size={16} />
                  My Wrapped
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                {canEdit ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group focus:outline-hidden"
                    disabled={uploading}
                    title="Change photo"
                  >
                    <Avatar name={playerName} imageUrl={avatarUrl} size="lg" />
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera size={14} className="text-white" />
                      )}
                    </div>
                  </button>
                ) : (
                  <Avatar name={playerName} imageUrl={avatarUrl} size="lg" />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold">{playerName}</h1>
                {favoriteGame && (
                  <p className="text-sm text-muted-foreground mt-0.5">Loves {favoriteGame.name}</p>
                )}
                {canEdit && avatarUrl && (
                  <button
                    onClick={handleRemovePhoto}
                    disabled={uploading}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-1 block"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-5 border-t border-border/40">
              <div className="text-center">
                <div className="text-2xl font-display font-bold">{countPlayed}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Played</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-display font-bold text-primary">{countWins}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Wins</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-display font-bold">{countWinRatePct}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">Win Rate</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Streak cards ── */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-lg border p-3 text-center">
              <div className="flex justify-center mb-1">
                <Flame size={20} className="text-orange-400" />
              </div>
              <div className="text-xl font-display font-bold">{countStreakCurrent}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Current Streak</div>
            </div>
            <div className="bg-card rounded-lg border p-3 text-center">
              <div className="flex justify-center mb-1">
                <Flame size={20} className="text-primary" />
              </div>
              <div className="text-xl font-display font-bold">{countStreakBest}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Best Streak</div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {favoriteGame && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-card border text-sm hover:border-primary/20 transition-colors">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Heart size={14} /> Favourite game
              </span>
              <span className="font-medium">
                {favoriteGame.name}{" "}
                <span className="text-muted-foreground">
                  ({pluralize(favoriteGame.count, "session")})
                </span>
              </span>
            </div>
          )}
          {bestGame && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-card border text-sm hover:border-primary/20 transition-colors">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Star size={14} /> Best game
              </span>
              <span className="font-medium">
                {bestGame.name}{" "}
                <span className="text-muted-foreground">
                  ({((bestGame.wins / bestGame.played) * 100).toFixed(0)}% WR)
                </span>
              </span>
            </div>
          )}
          {!bestGame && myResults.length > 0 && (
            <div className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground italic">
              Log 3+ plays of the same game to find your best.
            </div>
          )}
          {nemesis && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-card border text-sm hover:border-primary/20 transition-colors">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Swords size={14} /> Nemesis
              </span>
              <span className="font-medium">
                {nemesis[1].name}{" "}
                <span className="text-muted-foreground">({nemesis[1].theirWins} wins vs you)</span>
              </span>
            </div>
          )}
          {!nemesis && Object.keys(h2h).length > 0 && (
            <div className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground italic">
              Play 2 or more games together to unlock nemesis.
            </div>
          )}
          {friendlyRival && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-card border text-sm hover:border-primary/20 transition-colors">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Crown size={14} /> Favourite prey
              </span>
              <span className="font-medium">
                {friendlyRival[1].name}{" "}
                <span className="text-muted-foreground">
                  ({friendlyRival[1].myWins} wins over them)
                </span>
              </span>
            </div>
          )}
          {!friendlyRival && Object.keys(h2h).length > 0 && (
            <div className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground italic">
              Play 2 or more games together to unlock favourite prey.
            </div>
          )}
        </section>

        {playerStats && (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Achievements</h2>
            {playerStats.seasonTitles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {playerStats.seasonTitles.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2.5 py-1 text-xs font-medium text-yellow-400"
                  >
                    🏆 {t.label} Champion
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {playerStats.achievements.map((a) => (
                <AchievementBadge key={a.id} achievement={a} />
              ))}
            </div>
          </section>
        )}

        {playerStats && playerStats.winRateTrend.length >= 3 && (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">Win Rate Trend</h2>
            <div className="bg-card rounded-lg border p-4">
              <WinRateTrendChart data={playerStats.winRateTrend} />
            </div>
          </section>
        )}

        {playerStats && playerStats.perGameStats.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold mb-3">By Game</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left">Game</th>
                    <th className="pb-2 text-right">Played</th>
                    <th className="pb-2 text-right">Wins</th>
                    <th className="pb-2 text-right">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.perGameStats.map((g) => (
                    <tr
                      key={g.gameId}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2 font-medium">{g.gameName}</td>
                      <td className="py-2 text-right text-muted-foreground">{g.played}</td>
                      <td className="py-2 text-right">{g.wins}</td>
                      <td className="py-2 text-right">
                        <span
                          className={g.winRate >= 0.5 ? "text-primary" : "text-muted-foreground"}
                        >
                          {Math.round(g.winRate * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {games.length > 0 &&
          (() => {
            const playedIds = new Set(myResults.map((r) => r.gameId));
            const catalogGameIds = new Set(games.flatMap((g) => [g.pk, idFromPk(g.pk)]));
            const extraPlayed = Array.from(
              new Map(
                myResults
                  .filter((r) => !catalogGameIds.has(r.gameId))
                  .map((r) => [
                    r.gameId,
                    {
                      pk: r.gameId,
                      name: r.gameName,
                      imageUrl: r.gameImageUrl ?? undefined,
                      tags: [],
                      createdAt: r.createdAt,
                    },
                  ]),
              ).values(),
            );
            const played = [
              ...games.filter((g) => playedIds.has(idFromPk(g.pk)) || playedIds.has(g.pk)),
              ...extraPlayed,
            ];
            const unplayed = games.filter(
              (g) => !playedIds.has(idFromPk(g.pk)) && !playedIds.has(g.pk),
            );
            const totalPassportGames = games.length + extraPlayed.length;
            const playCounts: Record<string, number> = {};
            for (const r of myResults) {
              const key = idFromPk(
                games.find((g) => idFromPk(g.pk) === r.gameId || g.pk === r.gameId)?.pk ?? r.gameId,
              );
              playCounts[key] = (playCounts[key] ?? 0) + 1;
            }
            return (
              <section>
                <h2 className="text-lg font-display font-semibold mb-1">Game Passport</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  {played.length} of {totalPassportGames} games played
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {played.map((g) => (
                    <div
                      key={g.pk}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-border"
                    >
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center font-display font-bold text-white text-xl"
                          style={{ backgroundColor: colorForName(g.name) }}
                        >
                          {/* Phones show the name overlay instead, so the letter would clash. */}
                          <span className="hidden sm:inline">{g.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                        <span className="text-white text-[10px] font-medium text-center leading-tight line-clamp-2">
                          {g.name}
                        </span>
                        <span className="text-primary text-xs font-bold mt-0.5">
                          {playCounts[idFromPk(g.pk)] ?? 0}×
                        </span>
                      </div>
                    </div>
                  ))}
                  {unplayed.map((g) => (
                    <div
                      key={g.pk}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-border opacity-25"
                    >
                      {g.imageUrl ? (
                        <img
                          src={g.imageUrl}
                          alt={g.name}
                          className="w-full h-full object-cover grayscale"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-display font-bold text-white text-xl bg-muted">
                          {g.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                        <span className="text-white text-[10px] font-medium text-center leading-tight line-clamp-2">
                          {g.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

        <section>
          <h2 className="text-lg font-display font-semibold mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {recent.map((r) => (
              <div
                key={r.pk}
                className="flex items-center justify-between text-sm p-2 rounded-lg bg-card border hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{formatDate(r.date)}</span>
                  <Link
                    to={`/games/${gameLink(r.gameId)}`}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {r.gameName}
                  </Link>
                </div>
                <Badge variant={isResultWinner(r, id) ? "default" : "secondary"}>
                  {isResultWinner(r, id) ? (getWinnerIds(r).length > 1 ? "Tie" : "Win") : "Loss"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
      {wrappedOpen && (
        <WrappedOverlay
          playerName={playerName}
          slides={wrappedSlides}
          onClose={() => setWrappedOpen(false)}
        />
      )}
    </PageTransition>
  );
}
