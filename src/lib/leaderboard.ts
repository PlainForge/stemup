/** Only people who've earned a point or finished a task can take a top-3 spot. */
export const hasEarned = (u: { points?: number; taskCompleted?: number }) =>
    (u.points ?? 0) > 0 || (u.taskCompleted ?? 0) > 0;

/**
 * Splits a ranking (already sorted, best first) into the top-3 podium and everyone
 * else. Anyone who hasn't earned anything yet starts from 4th, so the podium can
 * have empty spots. `rest[i]` is ranked `i + 4`.
 */
export function splitLeaderboard<T>(sorted: T[], earned: (u: T) => boolean = hasEarned as (u: T) => boolean) {
    const podium = sorted.filter(earned).slice(0, 3);
    const rest = sorted.filter(u => !podium.includes(u));
    return { podium, rest };
}

/** 1-3 on the podium, 4+ after it, or null if they aren't on the board. */
export function rankOf<T>(board: { podium: T[]; rest: T[] }, match: (u: T) => boolean): number | null {
    const p = board.podium.findIndex(match);
    if (p >= 0) return p + 1;
    const r = board.rest.findIndex(match);
    return r >= 0 ? r + 4 : null;
}
