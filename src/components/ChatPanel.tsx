// The message list and box shared by a role's group chat and a task's thread
// (src/lib/messages.ts). Your own messages sit on the right in blue; everyone
// else's on the left with their photo and name.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { MainContext } from "../context/MainContext";
import { confirmDialog } from "../lib/confirm";
import { deleteMessage, listenMessages, MAX_MESSAGE, sendMessage } from "../lib/messages";
import type { ChatMessage } from "../myDataTypes";
import ProfileImg from "./ProfileImg";

/** Messages from the same person this close together share one header */
const GROUP_MS = 5 * 60 * 1000;

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
    const meData = context?.userData ?? null;
    const [messages, setMessages] = useState<ChatMessage[] | null>(null);
    const [error, setError] = useState(false);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);

    useEffect(() => {
        setMessages(null);
        setError(false);
        return listenMessages(path, setMessages, err => {
            console.error("Error loading messages:", err);
            setError(true);
            setMessages([]);
        });
    }, [path]);

    // Keep the newest message in view, unless they've scrolled up to read older ones
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const onScroll = () => {
        const el = listRef.current;
        if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const send = async (e?: FormEvent) => {
        e?.preventDefault();
        const text = draft.trim();
        if (!text || sending || !me) return;
        setSending(true);
        stickToBottom.current = true;
        try {
            await sendMessage(path, { uid: me, name: meData?.name ?? "", photoURL: meData?.photoURL ?? "" }, text);
            setDraft("");
        } catch (err) {
            console.error("Error sending message:", err);
            setError(true);
        } finally {
            setSending(false);
        }
    };

    const remove = async (m: ChatMessage) => {
        const ok = await confirmDialog(m.uid === me ? "Delete this message for everyone?" : `Delete ${m.name || "this person"}'s message for everyone?`, { title: "Delete Message", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        await deleteMessage(path, m.id).catch(err => console.error("Error deleting message:", err));
    };

    return (
        <div className={`flex flex-col min-h-0 bg-white border border-gray-100 rounded-2xl overflow-hidden ${className}`}>
            <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col">
                {messages === null ? (
                    <p className="m-auto text-sm text-gray-400">Loading messages...</p>
                ) : messages.length === 0 ? (
                    <p className="m-auto max-w-xs text-center text-sm text-gray-400">{error ? "Couldn't load messages." : emptyText}</p>
                ) : messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const at = m.createdAt?.toDate() ?? new Date();
                    const prevAt = prev?.createdAt?.toDate();
                    const newDay = !prevAt || prevAt.toDateString() !== at.toDateString();
                    const grouped = !newDay && prev?.uid === m.uid && !!prevAt && at.getTime() - prevAt.getTime() < GROUP_MS;
                    const mine = m.uid === me;
                    const canDelete = mine || canModerate;
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
                                            {timeLabel(at)}
                                        </p>
                                    )}
                                    <p
                                        title={at.toLocaleString("en-US")}
                                        className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                            mine ? "bg-blue-600 text-white rounded-br-md" : "bg-gray-100 text-gray-800 rounded-bl-md"
                                        }`}
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
                        disabled={!draft.trim() || sending}
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
