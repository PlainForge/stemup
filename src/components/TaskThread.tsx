// A task's thread (src/lib/messages.ts): a button along the bottom of a task card
// that opens a window where the person doing the task and whoever gave it can ask
// and answer questions. Shown only when the role has task questions turned on, and
// only to those two people.
import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faComments, faXmark } from "@fortawesome/free-solid-svg-icons";
import { MainContext } from "../context/MainContext";
import { db } from "../lib/firebase";
import { inTaskThread, markThreadSeen, taskThreadPath, threadUnread } from "../lib/messages";
import type { Task } from "../myDataTypes";
import ChatPanel from "./ChatPanel";

export default function TaskThreadButton({ task, enabled, runsRole }: {
    task: Task;
    /** The role has task questions turned on */
    enabled: boolean;
    /** The signed-in person runs the task's role (they answer older tasks that don't record who gave them) */
    runsRole: boolean;
}) {
    const context = useContext(MainContext);
    const me = context?.user?.uid ?? "";
    const [open, setOpen] = useState(false);
    // Re-render after closing, so the unread dot clears
    const [, setSeenTick] = useState(0);

    if (!enabled || !inTaskThread(task, me, runsRole)) return null;
    const count = task.messageCount ?? 0;
    const unread = !open && threadUnread(task, me);
    const isDoer = task.assignedTo === me;

    const close = () => {
        markThreadSeen(task, me);
        setOpen(false);
        setSeenTick(t => t + 1);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => { markThreadSeen(task, me); setOpen(true); }}
                className="group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:cursor-pointer"
            >
                <FontAwesomeIcon icon={faComments} className="text-xs text-blue-500" />
                <span className="flex-1">{isDoer ? "Questions" : "Questions from " + (task.assignedName || "them").split(" ")[0]}</span>
                {unread ? (
                    <span className="rounded-full bg-red-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">New</span>
                ) : count > 0 ? (
                    <span className="rounded-full bg-gray-100 px-2 py-px text-xs font-semibold text-gray-500 group-hover:bg-white">{count}</span>
                ) : null}
                <FontAwesomeIcon icon={faChevronRight} className="text-[10px] text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </button>
            {open && createPortal(<ThreadWindow task={task} isDoer={isDoer} onClose={close} />, document.body)}
        </>
    );
}

function ThreadWindow({ task, isDoer, onClose }: { task: Task; isDoer: boolean; onClose: () => void }) {
    const [entered, setEntered] = useState(false);
    const [giverName, setGiverName] = useState<string | null>(null);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setEntered(true));
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    // Who gave the task, for the line under the title
    useEffect(() => {
        if (!isDoer || !task.assignedBy) return;
        getDoc(doc(db, "users", task.assignedBy))
            .then(snap => setGiverName((snap.data()?.name as string | undefined) ?? null))
            .catch(() => {});
    }, [isDoer, task.assignedBy]);

    const other = isDoer ? (task.assignedBy ? giverName ?? "whoever gave it" : "the role's instructors") : task.assignedName || "them";

    return (
        <div
            className={`fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:px-6 bg-black/50 transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Questions about ${task.title}`}
                onClick={e => e.stopPropagation()}
                className={`flex h-[85dvh] sm:h-[75vh] w-full sm:max-w-lg flex-col gap-3 rounded-t-3xl sm:rounded-3xl bg-gray-50 p-4 shadow-xl transition-all duration-200 ${
                    entered ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-6 opacity-0 sm:scale-95"
                }`}
            >
                <div className="flex items-start gap-3 px-1">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <FontAwesomeIcon icon={faComments} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="font-bold leading-snug break-words">{task.title}</h2>
                        <p className="text-sm text-gray-500">Only you and {other} can see these messages.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 hover:cursor-pointer"
                    >
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>
                <ChatPanel
                    path={taskThreadPath(task.id)}
                    canPost
                    className="flex-1"
                    placeholder={isDoer ? "Ask a question..." : "Reply..."}
                    emptyText={isDoer ? "Ask about this task here, or raise any concerns." : `No messages yet. ${task.assignedName || "They"} can ask questions about this task here.`}
                />
            </div>
        </div>
    );
}
