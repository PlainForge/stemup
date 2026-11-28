// The message list and box shared by a role's group chat and a task's thread
// (src/lib/messages.ts). Your own messages sit on the right in blue; everyone
// else's on the left with their photo and name.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglassHalf, faPaperPlane, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { MainContext } from "../context/MainContext";
import { confirmDialog } from "../lib/confirm";
import { ChatTimeoutError, deleteMessage, listenMessages, MAX_MESSAGE, sendMessage } from "../lib/messages";
import type { ChatMessage } from "../myDataTypes";
import ProfileImg from "./ProfileImg";

/** Messages from the same person this close together share one header */
const GROUP_MS = 5 * 60 * 1000;

/**
 * A message shown the moment it's sent, before the server has it. [id] is the
 * real message's id once the server answers; it stops showing when that arrives.
 */
type Pending = { key: string; text: string; id?: string };
const PENDING = "pending-";

const dayLabel = (d: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
};
const timeLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function ChatPanel({ path, canPost, closedText, canModerate = false, emptyText, placeholder = "Message...", className = "" }: {
    /** The messages collection, e.g. roles/abc/messages */
    path: string;
    canPost: boolean;
    /** Shown instead of the message box when [canPost] is false */
    closedText?: string;
    /** Can remove anyone's message (the role's instructors and admins, in a group chat) */
    canModerate?: boolean;
    emptyText: string;
    placeholder?: string;
    /** Sizing for the whole panel, e.g. a fixed height */
    className?: string;
}) {
    const context = useContext(MainContext);
    const me = context?.user?.uid ?? "";
    const [messages, setMessages] = useState<ChatMessage[] | null>(null);
    const [error, setError] = useState(false);
    const [draft, setDraft] = useState("");
    const [pending, setPending] = useState<Pending[]>([]);
    const [sendError, setSendError] = useState("");
    // Sent too many messages too fast: no sending until this time (ms), with a countdown
    const [timeoutUntil, setTimeoutUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const timedOut = timeoutUntil > now;
    const listRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);

    useEffect(() => {
        setMessages(null);
        setError(false);
        setPending([]);
        return listenMessages(path, list => {
            setMessages(list);
            // Sent messages the server has now delivered
            const ids = new Set(list.map(m => m.id));
            setPending(p => p.some(x => x.id && ids.has(x.id)) ? p.filter(x => !x.id || !ids.has(x.id)) : p);
        }, err => {
            console.error("Error loading messages:", err);
            setError(true);
            setMessages([]);
        });
    }, [path]);

    // Tick the countdown each second while timed out
    useEffect(() => {
        if (timeoutUntil <= Date.now()) return;
        const tick = setInterval(() => {
            setNow(Date.now());
            if (Date.now() >= timeoutUntil) clearInterval(tick);
        }, 1000);
        return () => clearInterval(tick);
    }, [timeoutUntil]);

    // Keep the newest message in view, unless they've scrolled up to read older ones
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages, pending]);

    const onScroll = () => {
        const el = listRef.current;
        if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const send = async (e?: FormEvent) => {
        e?.preventDefault();
        const text = draft.trim();
        if (!text || !me || timedOut) return;
        // Show it straight away; the server's copy replaces it when it arrives
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setPending(p => [...p, { key, text }]);
        setDraft("");
        setSendError("");
        stickToBottom.current = true;
        try {
            const id = await sendMessage(path, text);
            setPending(p => id ? p.map(x => x.key === key ? { ...x, id } : x) : p.filter(x => x.key !== key));
        } catch (err) {
            // Not sent: take it back out, and put it back in the box if that's empty
            setPending(p => p.filter(x => x.key !== key));
            setDraft(d => d.trim() ? d : text);
            if (err instanceof ChatTimeoutError) {
                // Their draft stays, ready to send once the timeout ends
                setNow(Date.now());
                setTimeoutUntil(err.until);
            } else {
                console.error("Error sending message:", err);
                setSendError("Couldn't send your message. Please try again.");
            }
        }
    };

    // The server's messages, then this person's still on their way
    const shown: ChatMessage[] | null = messages && [
        ...messages,
        ...pending
            .filter(p => !p.id || !messages.some(m => m.id === p.id))
            .map(p => ({ id: PENDING + p.key, uid: me, name: context?.userData?.name ?? "", text: p.text })),
    ];

    const remove = async (m: ChatMessage) => {
        const ok = await confirmDialog(m.uid === me ? "Delete this message for everyone?" : `Delete ${m.name || "this person"}'s message for everyone?`, { title: "Delete Message", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        await deleteMessage(path, m.id).catch(err => console.error("Error deleting message:", err));
    };

    return (
        <div className={`flex flex-col min-h-0 bg-white border border-gray-100 rounded-2xl overflow-hidden ${className}`}>
            <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col">
                {shown === null ? (
                    <p className="m-auto text-sm text-gray-400">Loading messages...</p>
                ) : shown.length === 0 ? (
                    <p className="m-auto max-w-xs text-center text-sm text-gray-400">{error ? "Couldn't load messages." : emptyText}</p>
                ) : shown.map((m, i) => {
                    const prev = shown[i - 1];
                    const at = m.createdAt?.toDate() ?? new Date();
                    const prevAt = prev?.createdAt?.toDate();
                    const newDay = !prevAt || prevAt.toDateString() !== at.toDateString();
                    const grouped = !newDay && prev?.uid === m.uid && !!prevAt && at.getTime() - prevAt.getTime() < GROUP_MS;
                    const mine = m.uid === me;
                    const sending = m.id.startsWith(PENDING);
                    const canDelete = !sending && (mine || canModerate);
                    return (
                        <div key={m.id} className="flex flex-col">
                            {newDay && (
                                <p className="self-center my-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{dayLabel(at)}</p>
                            )}
                            <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
                                {!mine && (
                                    <span className="w-8 shrink-0">
                                        {!grouped && <ProfileImg src={m.photoURL} alt={m.name} size="xxs" />}
                                    </span>
                                )}
                                <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                                    {!grouped && (
                                        <p className={`mb-1 px-1 text-xs text-gray-400 ${mine ? "text-right" : ""}`}>
                                            {!mine && <span className="font-semibold text-gray-600">{m.name || "Unknown User"} · </span>}
                                            {sending ? "Sending..." : timeLabel(at)}
                                        </p>
                                    )}
                                    <p
                                        title={at.toLocaleString("en-US")}
                                        className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words transition-opacity ${
                                            mine ? "bg-blue-600 text-white rounded-br-md" : "bg-gray-100 text-gray-800 rounded-bl-md"
                                        } ${sending ? "opacity-60" : ""}`}
                                    >
                                        {m.text}
                                    </p>
                                </div>
                                {canDelete && (
                                    <button
                                        type="button"
                                        onClick={() => remove(m)}
                                        aria-label="Delete message"
                                        title="Delete message"
                                        className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-red-500 hover:cursor-pointer focus-visible:opacity-100 group-hover:opacity-100"
                                    >
                                        <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {canPost && timedOut && (
                <p role="status" className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-xs" />
                    Slow down! You sent too many messages at once. You can send again in {Math.max(1, Math.ceil((timeoutUntil - now) / 1000))}s.
                </p>
            )}
            {canPost && sendError && !timedOut && (
                <p role="alert" className="border-t border-gray-100 px-4 py-2 text-sm text-red-600 dark:text-red-400">{sendError}</p>
            )}
            {canPost ? (
                <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 p-2.5">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value.slice(0, MAX_MESSAGE))}
                        // Enter sends; Shift+Enter starts a new line
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                void send();
                            }
                        }}
                        rows={1}
                        placeholder={placeholder}
                        aria-label="Message"
                        className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm field-sizing-content focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                    <button
                        type="submit"
                        disabled={!draft.trim() || timedOut}
                        aria-label="Send"
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <FontAwesomeIcon icon={faPaperPlane} className="text-sm" />
                    </button>
                </form>
            ) : closedText ? (
                <p className="border-t border-gray-100 px-4 py-3 text-center text-sm text-gray-400">{closedText}</p>
            ) : null}
        </div>
    );
}
