// "About Me" on a profile: short, optional, and free of profanity. The
// cleanProfileName Cloud Function enforces the same limits on every save
// (functions/src/nameFilter.ts); keep the numbers in sync with it, the
// Firestore rules and mobile/lib/screens/settings_screen.dart.
import { isProfaneName } from "./nameFilter";

export const ABOUT_ME_MAX_WORDS = 200;
/** A hard cap on characters too, so one very long "word" can't get around the word limit */
export const ABOUT_ME_MAX_CHARS = 1500;

export const countWords = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

/** Trimmed, with runs of blank lines collapsed */
export const tidyAboutMe = (text: string) => text.trim().replace(/\n{3,}/g, "\n\n");

/** Why it can't be saved, or null when it's fine */
export function aboutMeProblem(text: string): string | null {
    if (countWords(text) > ABOUT_ME_MAX_WORDS) return `Please keep your About Me to ${ABOUT_ME_MAX_WORDS} words or fewer.`;
    if (text.length > ABOUT_ME_MAX_CHARS) return `Please keep your About Me under ${ABOUT_ME_MAX_CHARS} characters.`;
    if (isProfaneName(text)) return "Your About Me has words that aren't allowed. Please change them.";
    return null;
}
