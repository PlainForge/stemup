// Role messaging: a role's group chat (roles/{id}/messages) and each task's
// thread (tasks/{id}/messages), between the person doing the task and whoever
// gave it. Both are off until the role's owner or an admin turns them on in the
// role's Config (chatEnabled, taskThreadsEnabled). There are no private messages.
//
// Messages are sent through the sendMessage Cloud Function, which masks
// profanity with asterisks and puts anyone sending more than 5 messages in 10
// seconds in a 30-second timeout. New messages reach the iOS app as push
// notifications (notifyOnRoleMessage, notifyOnTaskMessage), never by email.
// "Seen" markers live in this browser only, like the NEW badge on tasks.
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type { ChatMessage, Task } from "../myDataTypes";

/** How much of a chat or thread is loaded: the latest messages */
const LOAD = 200;
/** Longest message (also checked by the Firestore rules) */
export const MAX_MESSAGE = 2000;

export const roleChatPath = (roleId: string) => `roles/${roleId}/messages`;
export const taskThreadPath = (taskId: string) => `tasks/${taskId}/messages`;

/** The latest messages at [path], oldest first. */
export function listenMessages(path: string, onChange: (messages: ChatMessage[]) => void, onError?: (err: Error) => void) {
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(LOAD));
    return onSnapshot(q, snap => {
        // Messages just sent have no server time yet; estimate it so they sort last
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data({ serverTimestamps: "estimate" }) as Omit<ChatMessage, "id">) }));
        onChange(list.reverse());
    }, err => onError?.(err));
}

/** Just the newest message at [path] (for the unread dot on a role's Chat tab). */
export function listenLatestMessage(path: string, onChange: (message: ChatMessage | null) => void) {
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, snap => {
        const d = snap.docs[0];
        onChange(d ? { id: d.id, ...(d.data({ serverTimestamps: "estimate" }) as Omit<ChatMessage, "id">) } : null);
    }, () => onChange(null));
}

/** Sending too fast: no more messages until [until] (ms since 1970). */
export class ChatTimeoutError extends Error {
    until: number;
    constructor(until: number) {
        super("You're sending messages too fast.");
        this.until = until;
    }
}

/**
 * Sends a message to the chat or thread at [path] (roles/{id}/messages or
 * tasks/{id}/messages) and returns the new message's id. Throws a
 * ChatTimeoutError while they're timed out.
 */
export async function sendMessage(path: string, text: string): Promise<string | undefined> {
    const clean = text.trim().slice(0, MAX_MESSAGE);
    if (!clean) return;
    const [collectionName, id] = path.split("/");
    try {
        const res = await httpsCallable<unknown, { id?: string }>(functions, "sendMessage")({ kind: collectionName === "roles" ? "role" : "task", id, text: clean });
        return res.data?.id;
    } catch (err) {
        const e = err as { code?: string; details?: { until?: number } };
        if (e.code === "functions/resource-exhausted") throw new ChatTimeoutError(e.details?.until ?? Date.now() + 30_000);
        throw err;
    }
}

export async function deleteMessage(path: string, id: string) {
    await deleteDoc(doc(db, path, id));
}

/**
 * Who can use a task's thread: the person doing it and whoever gave it. Older
 * tasks don't record who gave them, so the role's instructors answer those.
 */
export function inTaskThread(task: Pick<Task, "assignedTo" | "assignedBy">, uid: string | undefined, runsRole: boolean) {
    if (!uid) return false;
    if (uid === task.assignedTo) return true;
    return task.assignedBy ? task.assignedBy === uid : runsRole;
}

// ── Seen markers (this browser only) ──────────────────────────────────────

function readMap(key: string): Record<string, number> {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeMap(key: string, map: Record<string, number>) {
    try {
        localStorage.setItem(key, JSON.stringify(map));
    } catch {
        // Storage can be unavailable (private windows); the dot just shows again next time
    }
}

const threadKey = (uid: string) => `stemup_thread_seen_${uid}`;
const chatKey = (uid: string) => `stemup_chat_seen_${uid}`;

/** True when someone else has written on the task's thread since this person last opened it. */
export function threadUnread(task: Pick<Task, "id" | "messageCount" | "lastMessageBy">, uid: string) {
    const count = task.messageCount ?? 0;
    if (count === 0 || !task.lastMessageBy || task.lastMessageBy === uid) return false;
    return count > (readMap(threadKey(uid))[task.id] ?? 0);
}

export function markThreadSeen(task: Pick<Task, "id" | "messageCount">, uid: string) {
    const map = readMap(threadKey(uid));
    map[task.id] = task.messageCount ?? 0;
    writeMap(threadKey(uid), map);
}

/** When this person last looked at a role's group chat (ms since 1970; 0 if never). */
export function chatSeenAt(uid: string, roleId: string) {
    return readMap(chatKey(uid))[roleId] ?? 0;
}

export function markChatSeen(uid: string, roleId: string, at: number) {
    const map = readMap(chatKey(uid));
    if ((map[roleId] ?? 0) >= at) return;
    map[roleId] = at;
    writeMap(chatKey(uid), map);
}
