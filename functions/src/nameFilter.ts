// Keeps profanity out of display names and About Me.
//
// The apps check a name before saving it (the web app with the same library,
// the iOS app through checkName below). cleanProfileName is the backstop: it
// catches names that never went through a form (Google/Apple sign-in) or that
// were written straight to the database.

import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

/** Used in place of a name that was blocked. */
export const FALLBACK_NAME = "StemUp Member";

/** Also used to mask profanity in chat and thread messages (messages.ts). */
export const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * True if the name contains profanity. Also checks the name with punctuation
 * removed and spaced-out letters joined, so "f.u.c.k" and "f u c k" are caught.
 * Keep in sync with src/lib/nameFilter.ts.
 */
export function isProfaneName(name: string): boolean {
  const noPunct = name.replace(/[^\p{L}\p{N}\s]/gu, "");
  const joined = noPunct.replace(/\b(\p{L})\s+(?=\p{L}\b)/gu, "$1");
  return [name, noPunct, joined].some((v) => matcher.hasMatch(v));
}

/**
 * Lets the iOS app check a name before saving it. Open to signed-out callers,
 * since sign-up checks the name before the account exists; it only answers
 * yes or no.
 */
export const checkName = onCall({ invoker: "public" }, (request) => {
  // An About Me is checked the same way (sent as text, up to its 1,500-character cap)
  const text = typeof request.data?.text === "string" ? request.data.text.slice(0, ABOUT_ME_MAX_CHARS) : null;
  const name = typeof request.data?.name === "string" ? request.data.name.slice(0, 200) : "";
  return { ok: !isProfaneName(text ?? name) };
});

/** About Me limits (kept in sync with src/lib/aboutMe.ts and the Firestore rules) */
const ABOUT_ME_MAX_WORDS = 200;
const ABOUT_ME_MAX_CHARS = 1500;

/**
 * On any profile save: replaces a profane name with FALLBACK_NAME, removes a
 * profane About Me, and trims one that's over the word limit.
 */
export const cleanProfileName = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const before = event.data?.before;
  const fix: Record<string, unknown> = {};

  const name = after.get("name");
  if (typeof name === "string" && name !== before?.get("name") && isProfaneName(name)) {
    fix.name = FALLBACK_NAME;
  }

  const about = after.get("aboutMe");
  if (typeof about === "string" && about !== before?.get("aboutMe")) {
    if (isProfaneName(about)) {
      fix.aboutMe = FieldValue.delete();
    } else {
      const words = about.trim().split(/\s+/);
      if (words.length > ABOUT_ME_MAX_WORDS) fix.aboutMe = words.slice(0, ABOUT_ME_MAX_WORDS).join(" ");
    }
  }

  if (Object.keys(fix).length === 0) return;
  await after.ref.update(fix);
  logger.info(`Cleaned ${Object.keys(fix).join(" and ")} for uid ${event.params.uid}`);
});
