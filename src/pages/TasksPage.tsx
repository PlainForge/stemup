import { useContext, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowDownAZ, faArrowDownWideShort, faArrowDownZA, faArrowUpWideShort, faCalendar, faCalendarDays, faCalendarXmark,
    faChevronRight, faClock, faLayerGroup, faMagnifyingGlass, faTriangleExclamation, faUser, faUsers, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { MainContext } from "../context/MainContext";
import type { Role, Task } from "../myDataTypes";
import Loading from "./Loading";
import Dropdown from "../components/Dropdown";
import MemberTaskCard from "../components/MemberTaskCard";
import RoleIcon from "../components/RoleIcon";

type View = "todo" | "completed" | "all";
type DueFilter = "any" | "overdue" | "week" | "none";
const DAY = 24 * 60 * 60 * 1000;

const MONTH_OPTIONS = Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return { label: d.toLocaleString("en-US", { month: "long", year: "numeric" }), key: `${d.getFullYear()}-${d.getMonth()}` };
});

/**
 * /tasks: every task the signed-in person has been given, across the roles
 * they're in (not the ones they run), to do and completed, with search and
 * filters for the role, who gave it, when, and when it's due.
 */
export default function TasksPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const isAdmin = !!user && (context?.admins ?? []).includes(user.uid);

    const [tasks, setTasks] = useState<Task[] | null>(null);
    const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
    const [roles, setRoles] = useState<Role[]>([]);
    const [assigners, setAssigners] = useState<Record<string, string>>({});
    const [seen, setSeen] = useState<Set<string>>(new Set());

    const [view, setView] = useState<View>("todo");
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [byFilter, setByFilter] = useState("all");
    const [month, setMonth] = useState("all");
    const [dueFilter, setDueFilter] = useState<DueFilter>("any");
    const [sort, setSort] = useState("date-desc");

    useEffect(() => {
        if (!user) return;
        const unsubs = [
            onSnapshot(query(collection(db, "tasks"), where("assignedTo", "==", user.uid)), snap => {
                setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
            }, err => { console.error("Error loading tasks:", err); setTasks([]); }),
            onSnapshot(query(collection(db, "tasksSubmitted"), where("assignedTo", "==", user.uid), where("complete", "==", false)), snap => {
                setSubmittedIds(new Set(snap.docs.map(d => d.id)));
            }, err => console.error("Error loading submissions:", err)),
            onSnapshot(query(collection(db, "roles"), where("members", "array-contains", user.uid)), snap => {
                setRoles(snap.docs.filter(d => d.id !== GLOBAL_ROLE_ID).map(d => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
            }, err => console.error("Error loading roles:", err)),
        ];
        try {
            const stored = localStorage.getItem(`stemup_seen_tasks_${user.uid}`);
            if (stored) setSeen(new Set(JSON.parse(stored) as string[]));
        } catch { /* no storage */ }
        return () => unsubs.forEach(u => u());
    }, [user]);

    // Roles they take part in (not the ones they run, where they aren't given tasks)
    const myRoles = useMemo(
        () => roles.filter(r => !(r.instructors ?? []).includes(user?.uid ?? "")).sort((a, b) => a.name.localeCompare(b.name)),
        [roles, user],
    );
    const roleById = useMemo(() => new Map(myRoles.map(r => [r.id, r])), [myRoles]);
    const mine = useMemo(() => (tasks ?? []).filter(t => roleById.has(t.roleId)), [tasks, roleById]);

    // Names of the people who gave the tasks
    const assignerKey = Array.from(new Set(mine.map(t => t.assignedBy).filter((x): x is string => !!x))).sort().join(",");
    useEffect(() => {
        const ids = assignerKey ? assignerKey.split(",") : [];
        let cancelled = false;
        Promise.all(ids.map(id => getDoc(doc(db, "users", id)).then(s => [id, (s.data()?.name as string) ?? "Unknown"] as const).catch(() => [id, "Unknown"] as const)))
            .then(pairs => { if (!cancelled) setAssigners(Object.fromEntries(pairs)); });
        return () => { cancelled = true; };
    }, [assignerKey]);

    if (loading || !user) return <Loading />;

    const markSeen = (id: string) => {
        if (seen.has(id)) return;
        const next = new Set(seen).add(id);
        setSeen(next);
        try { localStorage.setItem(`stemup_seen_tasks_${user.uid}`, JSON.stringify([...next])); } catch { /* no storage */ }
    };

    const todoCount = mine.filter(t => !t.complete).length;
    const doneCount = mine.length - todoCount;
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const shown = mine
        .filter(t => view === "all" || (view === "todo" ? !t.complete : t.complete))
        .filter(t => roleFilter === "all" || t.roleId === roleFilter)
        .filter(t => byFilter === "all" || (byFilter === "none" ? !t.assignedBy : t.assignedBy === byFilter))
        .filter(t => {
            if (month === "all") return true;
            const [y, m] = month.split("-").map(Number);
            const d = t.createdOn?.toDate();
            return !!d && d.getFullYear() === y && d.getMonth() === m;
        })
        .filter(t => {
            const due = t.dueDate?.toMillis();
            if (dueFilter === "any") return true;
            if (dueFilter === "none") return due === undefined;
            if (due === undefined || t.complete) return false;
            return dueFilter === "overdue" ? due < now : due >= now && due - now <= 7 * DAY;
        })
        .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || (roleById.get(t.roleId)?.name ?? "").toLowerCase().includes(q))
        .sort((a, b) => {
            if (sort === "title-asc") return a.title.localeCompare(b.title);
            if (sort === "title-desc") return b.title.localeCompare(a.title);
            if (sort === "due") return (a.dueDate?.toMillis() ?? Infinity) - (b.dueDate?.toMillis() ?? Infinity);
            const aMs = a.createdOn?.toMillis() ?? 0;
            const bMs = b.createdOn?.toMillis() ?? 0;
            return sort === "date-asc" ? aMs - bMs : bMs - aMs;
        });

    const assignerOptions = Object.entries(assigners).sort((a, b) => a[1].localeCompare(b[1]));
    const anyUnrecorded = mine.some(t => !t.assignedBy);
    const filtersOn = roleFilter !== "all" || byFilter !== "all" || month !== "all" || dueFilter !== "any" || !!q;

    return (
        <motion.div className="w-full max-w-3xl mx-auto flex flex-col gap-5 px-4 py-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div>
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <p className="text-sm text-gray-500 mt-0.5">Everything you've been given, across all your roles.</p>
            </div>

            {isAdmin ? (
                <p className="text-gray-400 text-sm text-center py-8">Admins run roles rather than take part, so they aren't given tasks.</p>
            ) : (
                <>
                    {/* To do / Completed / All */}
                    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-100 p-1">
                        {([
                            { key: "todo", label: "To Do", count: todoCount },
                            { key: "completed", label: "Completed", count: doneCount },
                            { key: "all", label: "All", count: mine.length },
                        ] as const).map(v => (
                            <button
                                key={v.key}
                                type="button"
                                onClick={() => setView(v.key)}
                                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-all hover:cursor-pointer ${
                                    view === v.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"
                                }`}
                            >
                                {v.label}
                                <span className={`min-w-5 rounded-full px-1.5 text-xs ${view === v.key ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>{v.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Search and filters */}
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 transition-colors hover:border-gray-400 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search tasks or roles..."
                                aria-label="Search tasks"
                                className="w-full min-w-0 bg-transparent text-sm focus:outline-none"
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="flex size-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:cursor-pointer">
                                    <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                                </button>
                            )}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Dropdown
                                label="Role"
                                fullWidth
                                tone="gray"
                                value={roleFilter}
                                onChange={setRoleFilter}
                                options={[{ value: "all", label: "All roles", icon: faLayerGroup }, ...myRoles.map(r => ({ value: r.id, label: r.name, icon: faUsers }))]}
                            />
                            <Dropdown
                                label="Given by"
                                fullWidth
                                tone="gray"
                                value={byFilter}
                                onChange={setByFilter}
                                options={[
                                    { value: "all", label: "Given by anyone", icon: faUsers },
                                    ...assignerOptions.map(([id, name]) => ({ value: id, label: name, icon: faUser })),
                                    ...(anyUnrecorded ? [{ value: "none", label: "Not recorded (older tasks)", icon: faUser }] : []),
                                ]}
                            />
                            <Dropdown
                                label="Month given"
                                fullWidth
                                tone="gray"
                                value={month}
                                onChange={setMonth}
                                options={[{ value: "all", label: "Any month", icon: faCalendarDays }, ...MONTH_OPTIONS.map(m => ({ value: m.key, label: m.label, icon: faCalendar }))]}
                            />
                            <Dropdown<DueFilter>
                                label="Due"
                                fullWidth
                                tone="gray"
                                value={dueFilter}
                                onChange={setDueFilter}
                                options={[
                                    { value: "any", label: "Any due date", icon: faCalendarDays },
                                    { value: "week", label: "Due in the next 7 days", icon: faClock },
                                    { value: "overdue", label: "Overdue", icon: faTriangleExclamation },
                                    { value: "none", label: "No due date", icon: faCalendarXmark },
                                ]}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-gray-400">
                                {shown.length} task{shown.length === 1 ? "" : "s"}
                                {filtersOn && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearch(""); setRoleFilter("all"); setByFilter("all"); setMonth("all"); setDueFilter("any"); }}
                                        className="ml-2 font-semibold text-blue-600 hover:text-blue-700 hover:cursor-pointer"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </p>
                            <div className="w-48">
                                <Dropdown
                                    label="Sort"
                                    fullWidth
                                    tone="gray"
                                    value={sort}
                                    onChange={setSort}
                                    options={[
                                        { value: "date-desc", label: "Newest first", icon: faArrowDownWideShort },
                                        { value: "date-asc", label: "Oldest first", icon: faArrowUpWideShort },
                                        { value: "due", label: "Due soonest", icon: faClock },
                                        { value: "title-asc", label: "Title A–Z", icon: faArrowDownAZ },
                                        { value: "title-desc", label: "Title Z–A", icon: faArrowDownZA },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>

                    {tasks === null ? (
                        <p className="text-gray-400 text-sm text-center py-8">Loading tasks...</p>
                    ) : shown.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-10">
                            {mine.length === 0 ? "You haven't been given any tasks yet." : filtersOn ? "No tasks match these filters." : view === "todo" ? "You're all caught up!" : "Nothing here yet."}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {shown.map(task => {
                                const role = roleById.get(task.roleId);
                                const isSubmitted = submittedIds.has(task.id);
                                return (
                                    <motion.div key={task.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                        <MemberTaskCard
                                            task={task}
                                            isSubmitted={isSubmitted}
                                            isNew={!task.complete && !isSubmitted && !seen.has(task.id)}
                                            onSeen={() => markSeen(task.id)}
                                            threads={role?.taskThreadsEnabled === true}
                                            header={
                                                <div className="flex items-center justify-between gap-2 -mb-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/roles/${task.roleId}?view=tasks`)}
                                                        className="group/role flex min-w-0 items-center gap-2 rounded-lg -ml-1 px-1 py-0.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:cursor-pointer"
                                                    >
                                                        <RoleIcon role={role} size="sm" />
                                                        <span className="truncate">{role?.name ?? "Role"}</span>
                                                        <FontAwesomeIcon icon={faChevronRight} className="text-[10px] text-gray-300 transition-transform group-hover/role:translate-x-0.5" />
                                                    </button>
                                                    <span className="text-xs text-gray-400 truncate">
                                                        {task.assignedBy ? `From ${assigners[task.assignedBy] ?? "..."}` : ""}
                                                    </span>
                                                </div>
                                            }
                                        />
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );
}
