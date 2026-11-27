// Lets an instructor give up Instructor access themselves (Settings > Access).
// Runs on the server because the rules only let admins edit admins/instructors
// and other people's role lists. Does what an admin's "Remove Instructor" does:
// they go back to being a User, stay a member of their roles, stop running
// them, and roles they owned are left without an owner.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const leaveInstructor = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");

  const db = getFirestore();
  const instructorsRef = db.doc("admins/instructors");
  const ids: string[] = (await instructorsRef.get()).data()?.ids ?? [];
  if (!ids.includes(uid)) throw new HttpsError("failed-precondition", "You aren't an Instructor.");

  const led = await db.collection("roles").where("instructors", "array-contains", uid).get();
  const batch = db.batch();
  for (const d of led.docs) {
    const data = d.data();
    // A role's owner is `owner`, or (for roles from before owners) the instructor who created it
    const owner = typeof data.owner === "string" ? data.owner : data.createdBy ?? "";
    batch.update(d.ref, {
      instructors: FieldValue.arrayRemove(uid),
      ...(owner === uid ? { owner: "" } : {}),
    });
  }
  batch.set(instructorsRef, { ids: FieldValue.arrayRemove(uid) }, { merge: true });
  await batch.commit();

  logger.info(`${uid} left Instructor access (stopped running ${led.size} role(s))`);
  return { roles: led.size };
});
