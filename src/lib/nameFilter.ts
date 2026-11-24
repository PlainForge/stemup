// Keeps profanity out of display names. The cleanProfileName Cloud Function
// enforces the same check on every profile save (functions/src/nameFilter.ts);
// keep the two in sync.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

/** Used in place of a name that was blocked (same as Apple's no-name fallback). */
export const FALLBACK_NAME = "StemUp Member";

export const BLOCKED_NAME_MESSAGE = "That name isn't allowed. Please choose a different one.";

const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

/**
 * True if the name contains profanity. Also checks the name with punctuation
 * removed and spaced-out letters joined, so "f.u.c.k" and "f u c k" are caught.
 */
export function isProfaneName(name: string): boolean {
    const noPunct = name.replace(/[^\p{L}\p{N}\s]/gu, "");
    const joined = noPunct.replace(/\b(\p{L})\s+(?=\p{L}\b)/gu, "$1");
    return [name, noPunct, joined].some(v => matcher.hasMatch(v));
}

/** The name, or FALLBACK_NAME if it's profane (for names from Google/Apple). */
export function cleanName(name: string | null | undefined): string | null | undefined {
    return name && isProfaneName(name) ? FALLBACK_NAME : name;
}
