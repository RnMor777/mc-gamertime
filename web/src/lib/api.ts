import { navigation } from "./navigation";
import type {
  AdminSettings,
  AuthUser,
  BggGameDetail,
  BggSearchResult,
  CommentItem,
  Game,
  NotificationsResponse,
  Player,
  PlayerStats,
  PlayerVariableInput,
  Post,
  PublicSettings,
  ReactionItem,
  Recommendation,
  RecommendationDetail,
  Result,
  StatsResponse,
  UserSummary,
} from "./types";

// All API calls use the /api prefix.
// In development: Vite proxies these to http://localhost:8000
// In production: CloudFront routes these to the Lambda function
const BASE = "/api";

export interface RateLimitError extends Error {
  status: 429;
  retryAfter: number | null;
}

class AuthError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 401) {
    if (window.location.pathname !== "/login") {
      sessionStorage.setItem("_expiredRedirect", window.location.pathname);
    }
    navigation.clearAuth();
    throw new AuthError();
  }
  if (!res.ok) {
    const body = await res.text();
    let msg: string;
    try {
      const parsed = JSON.parse(body);
      msg = typeof parsed.detail === "string" ? parsed.detail : `API error ${res.status}`;
    } catch {
      msg = body || `API error ${res.status}`;
    }
    if (res.status === 429) {
      const retryAfterRaw = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
      const err: RateLimitError = Object.assign(new Error(msg), {
        status: 429 as const,
        retryAfter: Number.isNaN(retryAfterRaw) ? null : retryAfterRaw,
      });
      throw err;
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Games
export function getGames(): Promise<Game[]> {
  return apiFetch("/games");
}

export function addGame(game: Omit<Game, "pk" | "createdAt">): Promise<Game> {
  return apiFetch("/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(game),
  });
}

export function deleteGame(id: string): Promise<void> {
  return apiFetch(`/games/${id}`, { method: "DELETE" });
}

type ClearableGameField =
  | "imageUrl"
  | "minPlayers"
  | "maxPlayers"
  | "playTime"
  | "weight"
  | "yearPublished";

export function updateGame(
  id: string,
  data: Partial<Omit<Game, "pk" | "createdAt" | "playerVariables" | ClearableGameField>> & {
    playerVariables?: PlayerVariableInput[];
    imageUrl?: string | null;
    minPlayers?: number | null;
    maxPlayers?: number | null;
    playTime?: number | null;
    weight?: number | null;
    yearPublished?: number | null;
  },
): Promise<Game> {
  return apiFetch(`/games/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function uploadAvatar(username: string, file: File): Promise<{ avatarUrl: string }> {
  return apiFetch(`/users/${username}/avatar`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}

export function deleteAvatar(username: string): Promise<void> {
  return apiFetch(`/users/${username}/avatar`, { method: "DELETE" });
}

export function addGameFavorite(id: string): Promise<void> {
  return apiFetch(`/games/${id}/favorite`, { method: "POST" });
}
export function removeGameFavorite(id: string): Promise<void> {
  return apiFetch(`/games/${id}/favorite`, { method: "DELETE" });
}

export function getGameUploadUrl(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageUrl: string }> {
  return apiFetch("/games/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
}

export function searchBgg(q: string): Promise<BggSearchResult[]> {
  return apiFetch(`/games/search?q=${encodeURIComponent(q)}`);
}

export function getBggDetail(bggId: number): Promise<BggGameDetail> {
  return apiFetch(`/games/search?bggId=${bggId}`);
}

// Players
export function getPlayers(): Promise<Player[]> {
  return apiFetch("/players");
}

// Results
export function getResults(): Promise<Result[]> {
  return apiFetch("/results");
}

export function addResult(
  result: Omit<Result, "pk" | "createdAt" | "milestone" | "newAchievements">,
): Promise<Result> {
  return apiFetch("/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}

export function deleteResult(id: string): Promise<void> {
  return apiFetch(`/results/${id}`, { method: "DELETE" });
}

export function updateResult(
  id: string,
  data: Partial<Omit<Result, "pk" | "createdAt" | "milestone" | "newAchievements">>,
): Promise<Result> {
  return apiFetch(`/results/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Notifications
export function getNotifications(): Promise<NotificationsResponse> {
  return apiFetch("/notifications");
}

export function markNotificationsRead(): Promise<void> {
  return apiFetch("/notifications/read", { method: "POST" });
}

// Reactions & Comments
export function getReactions(): Promise<(ReactionItem | CommentItem)[]> {
  return apiFetch("/reactions");
}

export function toggleReaction(
  sessionPk: string,
  emoji: string,
): Promise<{ action: "added" | "removed"; item: ReactionItem | null }> {
  return apiFetch("/reactions/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionPk, emoji }),
  });
}

export function addComment(sessionPk: string, text: string): Promise<CommentItem> {
  return apiFetch("/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionPk, text }),
  });
}

export function deleteComment(id: string): Promise<void> {
  return apiFetch(`/comments/${id}`, { method: "DELETE" });
}

// Stats
export function getStats(): Promise<StatsResponse> {
  return apiFetch("/stats");
}

export function getPlayerStats(playerId: string): Promise<PlayerStats> {
  return apiFetch(`/players/${playerId}/stats`);
}

// Health
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// OIDC Auth
export interface OidcConfig {
  enabled: boolean;
  localLoginAllowed: boolean;
}

export function getOidcConfig(): Promise<OidcConfig> {
  return apiFetch("/auth/oidc/config");
}

export function startOidcLogin(sessionId: string): Promise<{ authorizeUrl: string }> {
  return apiFetch("/auth/oidc/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

// Auth
export function login(username: string, password: string): Promise<AuthUser> {
  return apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<void> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function forgotPassword(username: string): Promise<void> {
  return apiFetch("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiFetch("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${BASE}/auth/me`);
  if (!res.ok) return null;
  return res.json();
}

// Users (admin only)
export function getUsers(): Promise<UserSummary[]> {
  return apiFetch("/users");
}

export function createUser(data: {
  username: string;
  displayName: string;
  password: string;
  role: "admin" | "readonly";
}): Promise<UserSummary> {
  return apiFetch("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateUser(
  username: string,
  data: { displayName?: string; role?: "admin" | "readonly"; password?: string },
): Promise<UserSummary> {
  return apiFetch(`/users/${username}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteUser(username: string): Promise<void> {
  return apiFetch(`/users/${username}`, { method: "DELETE" });
}

// Settings
export function getPublicSettings(): Promise<PublicSettings> {
  return apiFetch("/settings/public");
}

export function getSettings(): Promise<AdminSettings> {
  return apiFetch("/settings");
}

export function updateSettings(data: {
  displayName?: string | null;
  bggToken?: string | null;
  appBaseUrl?: string | null;
  showProjectInfo?: boolean;
  sourceUrl?: string | null;
  docsUrl?: string | null;
}): Promise<AdminSettings> {
  return apiFetch("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getPosts(): Promise<Post[]> {
  return apiFetch("/posts");
}

export function createPost(data: Omit<Post, "pk" | "createdAt">): Promise<Post> {
  return apiFetch("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updatePost(id: string, data: Partial<Post>): Promise<Post> {
  return apiFetch(`/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deletePost(id: string): Promise<void> {
  return apiFetch(`/posts/${id}`, { method: "DELETE" });
}

export function getUploadUrl(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageUrl: string }> {
  return apiFetch("/posts/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
}

// Recommended games (public GET, admin writes)
export function getRecommended(): Promise<Recommendation[]> {
  return apiFetch("/recommended");
}

export function getRecommendedDetail(id: string): Promise<RecommendationDetail> {
  return apiFetch(`/recommended/${id}`);
}

export function createRecommended(data: {
  gamePk: string;
  blurb: string;
  tags: string[];
  bestFor: string;
  order: number;
}): Promise<Recommendation> {
  return apiFetch("/recommended", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateRecommended(
  id: string,
  data: {
    blurb?: string;
    tags?: string[];
    bestFor?: string;
    order?: number;
    content?: string;
  },
): Promise<Recommendation> {
  return apiFetch(`/recommended/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteRecommended(id: string): Promise<void> {
  return apiFetch(`/recommended/${id}`, { method: "DELETE" });
}
