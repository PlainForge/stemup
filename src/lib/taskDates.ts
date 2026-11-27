// Due dates and timestamps on task cards (src/components/TaskCardParts.tsx).
import type { Timestamp } from "firebase/firestore";
import type { TaskTone } from "../components/TaskCardParts";

const DAY = 24 * 60 * 60 * 1000;

/** "Due today", "Due tomorrow", "Due in 3 days", "Due Dec 5", "Was due Nov 30", with a tone for how close it is */
export function dueInfo(due: Timestamp, done = false): { label: string; tone: TaskTone } {
    const d = due.toDate();
    const today = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(d) - startOf(today)) / DAY);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
    if (done) return { label: `Due ${date}`, tone: "gray" };
    if (days < 0) return { label: `Was due ${date}`, tone: "red" };
    if (days === 0) return { label: "Due today", tone: "orange" };
    if (days === 1) return { label: "Due tomorrow", tone: "orange" };
    if (days <= 6) return { label: `Due in ${days} days`, tone: "amber" };
    return { label: `Due ${date}`, tone: "gray" };
}

export const shortDateTime = (t?: Timestamp) =>
    t?.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) ?? "";
