// Keeps profanity out of display names.
//
// The apps check a name before saving it (the web app with the same library,
// the iOS app through checkName below). cleanProfileName is the backstop: it
// catches names that never went through a form (Google/Apple sign-in) or that
// were written straight to the database.

import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

/** Used in place of a name that was blocked. */
export const FALLBACK_NAME = "StemUp Member";

const matcher = new RegExpMatcher({
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
  const name = typeof request.data?.name === "string" ? request.data.name.slice(0, 200) : "";
  return { ok: !isProfaneName(name) };
});

/** Replaces a profane name on any profile save with FALLBACK_NAME. */
export const cleanProfileName = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const name = after.get("name");
  if (typeof name !== "string" || name === event.data?.before?.get("name")) return;
  if (!isProfaneName(name)) return;

  await after.ref.update({ name: FALLBACK_NAME });
  logger.info(`Replaced a blocked display name for uid ${event.params.uid}`);
});
