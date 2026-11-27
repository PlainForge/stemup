// Shared pieces for task cards (the role page's Tasks tab and the instructor /
// admin Tasks tab), so both lists look the same: a card with a colored edge for
// its state, a title with a points badge, and small chips for the details.
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy, type IconDefinition } from "@fortawesome/free-solid-svg-icons";

export type TaskTone = "blue" | "green" | "amber" | "red" | "gray" | "orange";

/** Chip colors, light and dark (the app's dark theme only remaps grays and blue-50) */
const TONES: Record<TaskTone, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30",
    amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
};

/** The colored edge down the card's left side */
const EDGES: Record<TaskTone, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    amber: "bg-amber-400",
    orange: "bg-orange-400",
    red: "bg-red-500",
    gray: "bg-gray-300",
};

export function TaskCard({ tone, children, onMouseEnter, faded = false }: { tone: TaskTone; children: ReactNode; onMouseEnter?: () => void; faded?: boolean }) {
    return (
        // The colored edge carries the rounded left corners; the card body beside it is square on the left
        <div
            onMouseEnter={onMouseEnter}
            className={`flex h-full rounded-2xl shadow-sm transition-shadow hover:shadow-md ${faded ? "opacity-80" : ""}`}
        >
            <span aria-hidden className={`w-1.5 shrink-0 rounded-l-2xl ${EDGES[tone]}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-r-2xl border border-l-0 border-gray-200 bg-white p-4">
                {children}
            </div>
        </div>
    );
}

export function TaskHeader({ title, points, isNew = false, done = false }: { title: string; points: number; isNew?: boolean; done?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
                <h3 className={`font-semibold leading-snug break-words ${done ? "text-gray-500 line-through decoration-gray-300" : ""}`}>{title}</h3>
                {isNew && (
                    <span className="mt-0.5 shrink-0 rounded-full bg-red-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">New</span>
                )}
            </div>
            <span className={`shrink-0 flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${TONES.amber}`}>
                <FontAwesomeIcon icon={faTrophy} className="text-[10px]" />
                {points} pts
            </span>
        </div>
    );
}

export function TaskDescription({ text }: { text?: string }) {
    return text?.trim()
        ? <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">{text}</p>
        : <p className="text-sm italic text-gray-400">No description</p>;
}

export function Chip({ tone = "gray", icon, children }: { tone?: TaskTone; icon?: IconDefinition; children: ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
            {icon && <FontAwesomeIcon icon={icon} className="text-[10px]" />}
            {children}
        </span>
    );
}

export function ChipRow({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

/** Light action buttons along the bottom of an instructor's task card */
export function CardAction({ onClick, icon, children, danger = false, disabled = false }: {
    onClick: () => void; icon: IconDefinition; children: ReactNode; danger?: boolean; disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-medium transition-colors hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                danger
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
                    : "text-gray-600 hover:bg-gray-100"
            }`}
        >
            <FontAwesomeIcon icon={icon} className="text-xs" />
            {children}
        </button>
    );
}
