import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tap/press feedback. Use transition-all (not transition-transform) — tailwind-merge
// treats all transition-* utilities as one conflict group, so a narrower class here
// would silently drop an element's existing transition-colors/transition-all.
export const pressable = "motion-safe:active:scale-[0.97] transition-all duration-100";

/** "1 session" / "3 sessions" — pass an explicit plural for irregular words */
export function pluralize(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDate(iso: string): string {
  const d = iso.includes("T") ? new Date(iso) : new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

// Extract player ULID from pk "PLAYER#<ulid>" or return pk if no prefix
export function idFromPk(pk: string): string {
  return pk.includes("#") ? pk.split("#")[1] : pk;
}

/**
 * Fills for letter placeholders (avatars, game stamps). Every entry keeps white text
 * at ≥ 4.7:1 — the old amber/emerald/cyan -600 shades were 3.2–3.8:1.
 */
export const PLACEHOLDER_COLORS = [
  "#e11d48",
  "#7c3aed",
  "#2563eb",
  "#0e7490",
  "#047857",
  "#b45309",
  "#c2410c",
  "#be185d",
];

/** Stable placeholder colour for a name — hashes the whole string, not just its first letter. */
export function colorForName(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

/** Plain text of an HTML string */
function stripHtml(html: string): string {
  // Parse instead of regex-stripping tags: DOMParser documents are inert (no scripts
  // run, nothing loads), and a regex like /<[^>]*>/ is incomplete sanitisation
  // (CodeQL js/incomplete-multi-character-sanitization). Block boundaries become
  // spaces so "<p>a.</p><p>b</p>" reads "a. b", not "a.b".
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.body.querySelectorAll(
    "p, div, li, h1, h2, h3, h4, h5, h6, blockquote, br",
  )) {
    el.after(" ");
  }
  return (doc.body.textContent ?? "").replace(/\s+/g, " ");
}

/** First n characters of plain text from HTML */
export function excerpt(html: string, length = 150): string {
  const plain = stripHtml(html).trim();
  return plain.length <= length ? plain : `${plain.slice(0, length).trimEnd()}…`;
}

/** "2026-08-14" -> "2026-Q3". Mirrors api/lib/seasons.py::season_of. */
export function seasonOf(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/**
 * The `?season=` deep-link value, or undefined (all-time) unless it is a real
 * "YYYY-Qn" season — a junk value would 422 the stats call and blank the page.
 */
export function seasonParam(raw: string | null): string | undefined {
  return raw && /^\d{4}-Q[1-4]$/.test(raw) ? raw : undefined;
}

/**
 * Match a game when all whitespace-separated search keywords appear in either
 * the base game's name or one of its expansions' names.
 */
export function gameMatchesSearch(
  game: { name: string; expansions?: { name: string }[] | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const words = q.split(/\s+/);
  const nameLower = game.name.toLowerCase();
  if (words.every((w) => nameLower.includes(w))) return true;
  return (game.expansions ?? []).some((exp) => {
    const expLower = exp.name.toLowerCase();
    return words.every((w) => expLower.includes(w));
  });
}

export function getWinnerIds(result: { winnerId: string; winnerIds?: string[] }): string[] {
  if (result.winnerIds && result.winnerIds.length > 0) return result.winnerIds;
  return result.winnerId ? [result.winnerId] : [];
}

export function isResultWinner(
  result: { winnerId: string; winnerIds?: string[] },
  playerId?: string | null,
): boolean {
  if (!playerId) return false;
  return getWinnerIds(result).includes(playerId);
}

export function formatWinners(result: { winnerName: string; winnerNames?: string[] }): string {
  if (result.winnerNames && result.winnerNames.length > 0) {
    return result.winnerNames.join(" & ");
  }
  return result.winnerName;
}
