export interface PlayerVariableDef {
  id: string;
  label: string;
  options: string[];
}

export interface PlayerVariableInput {
  label: string;
  options: string[];
}

export interface GameRulebook {
  id: string;
  filename: string;
  url: string;
  uploadedAt: string;
}

export interface Game {
  pk: string;
  name: string;
  description?: string;
  bggId?: number;
  imageUrl?: string;
  minPlayers?: number;
  maxPlayers?: number;
  playTime?: number;
  weight?: number;
  yearPublished?: number;
  tags: string[];
  createdAt: string;
  isFavorited?: boolean;
  playerVariables?: PlayerVariableDef[];
  trackTurnOrder?: boolean;
  rulebooks?: GameRulebook[];
}

export interface Player {
  pk: string;
  displayName: string;
  avatarUrl?: string;
}

interface ResultPlayer {
  playerId: string;
  playerName: string;
  score?: number;
  seat?: number | null;
  variables?: Record<string, string> | null;
}

export interface Result {
  pk: string;
  gameId: string;
  gameName: string;
  date: string;
  players: ResultPlayer[];
  winnerId: string;
  winnerName: string;
  createdAt: string;
  milestone?: string | null;
  newAchievements?: NewAchievement[];
  mood?: number | null;
}

export interface ReactionItem {
  pk: string;
  type: "reaction";
  sessionPk: string;
  emoji: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface CommentItem {
  pk: string;
  type: "comment";
  sessionPk: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface BggSearchResult {
  bggId: number;
  name: string;
  yearPublished?: number;
  thumbnail?: string;
}

export interface BggGameDetail {
  bggId: number;
  name: string;
  description?: string;
  yearPublished?: number;
  imageUrl?: string;
  minPlayers?: number;
  maxPlayers?: number;
  playTime?: number;
  weight?: number;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  wins: number;
  played: number;
  winRate: number;
  rating: number;
}

export interface HeadToHead {
  p1Id: string;
  p1Name: string;
  p2Id: string;
  p2Name: string;
  p1Wins: number;
  p2Wins: number;
}

export interface StreakEntry {
  playerId: string;
  name: string;
  current: number;
  best: number;
}

export interface PerMonth {
  month: string;
  count: number;
}

export interface StatsResponse {
  leaderboard: LeaderboardEntry[];
  headToHead: HeadToHead[];
  streaks: StreakEntry[];
  mostPlayed: { gameId: string; gameName: string; count: number } | null;
  perMonth: PerMonth[];
  gameStats: GameStat[];
}

export interface AuthUser {
  sub: string;
  role: "admin" | "readonly";
  displayName: string;
}

export interface UserSummary {
  username: string;
  avatarUrl?: string;
  displayName: string;
  role: "admin" | "readonly";
}

export interface PublicSettings {
  displayName: string;
  showProjectInfo: boolean;
  sourceUrl: string | null;
  docsUrl: string | null;
}

export interface AdminSettings {
  displayName: string;
  bggTokenSet: boolean;
  appBaseUrl: string | null;
  appBaseUrlEnvFallback: string | null;
  showProjectInfo: boolean;
  sourceUrl: string | null;
  docsUrl: string | null;
}

export interface Post {
  pk: string;
  title: string;
  content: string;
  sessionPk?: string;
  gameName?: string;
  gamePk?: string;
  createdAt: string;
  authorName: string;
}

export interface Recommendation {
  pk: string;
  gamePk: string;
  gameName: string;
  imageUrl: string;
  blurb: string;
  tags: string[];
  bestFor: string;
  order: number;
  createdAt: string;
  hasPost: boolean;
  slug?: string;
  minPlayers?: number;
  maxPlayers?: number;
  playTime?: number;
  weight?: number;
  yearPublished?: number;
}

export interface RecommendationDetail extends Recommendation {
  content: string;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  earnedAt: string | null;
}

interface NewAchievement {
  playerId: string;
  playerName: string;
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface AchievementNotification {
  pk: string;
  playerId: string;
  achievementId: string;
  label: string;
  icon: string;
  description: string;
  gameId: string;
  gameName: string;
  resultId: string;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: AchievementNotification[];
  unreadCount: number;
}

export interface PlayerStats {
  achievements: Achievement[];
  perGameStats: {
    gameId: string;
    gameName: string;
    wins: number;
    played: number;
    winRate: number;
  }[];
  winRateTrend: { month: string; winRate: number; wins: number; played: number }[];
}

interface GameStatPlayer {
  playerId: string;
  name: string;
  wins: number;
  played: number;
  winRate: number;
}

interface VariableOptionStat {
  value: string;
  picks: number;
  wins: number;
  pickRate: number;
  winRate: number;
  avgScore: number | null;
}

interface SeatStat {
  seat: number;
  plays: number;
  wins: number;
  winRate: number;
}

export interface GameStat {
  gameId: string;
  gameName: string;
  totalPlays: number;
  dominantPlayer: { playerId: string; name: string; wins: number; winRate: number };
  playerBreakdown: GameStatPlayer[];
  variableStats: Record<string, { label: string; breakdown: VariableOptionStat[] }>;
  seatStats: SeatStat[];
}
