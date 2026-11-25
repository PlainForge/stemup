import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { type Task, type UserData, type SubmittedTask, type SavedData } from "../myDataTypes";
import { useRole } from "../lib/useRole";
import { canManageRole, isRoleStaff } from "../lib/roleService";
import { motion } from "motion/react";
import RoleAdminPage from "../components/RoleAdmin";
import DoneButton from "../components/TaskDoneButton";
import { useNavigate, useParams } from "react-router-dom";
import Loading from "./Loading";
import { MainContext } from "../context/MainContext";
import Button from "../components/Button";
import ProfileButton from "../components/ProfileButton";
import ProfileImg from "../components/ProfileImg";
import MedalIcon from "../components/MedalIcon";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";


/** Stable fallback so hooks that depend on these lists don't re-run every render */
const NO_IDS: string[] = [];
export default function RolePage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();

    const { id: roleId } = useParams<{ id: string }>();
    const { role: liveRole, membersWithData, requested } = useRole(roleId);
    const role = liveRole ?? null;
    const [leaders, setLeaders] = useState<UserData[]>([]);
    const [userTasks, setUserTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("leaderboard");
    const [idCopied, setIdCopied] = useState(false);
    const copyRoleId = async () => {
        await navigator.clipboard.writeText(roleId ?? "");
        setIdCopied(true);
        setTimeout(() => setIdCopied(false), 1500);
    };
    const tabBar = useSlidingIndicator(pageState);
    const [rewards, setRewards] = useState<string[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);

    const [submittedTasks, setSubmittedTasks] = useState<SubmittedTask[]>([]);
    const [taskSearch, setTaskSearch] = useState("");
    const [taskMonthFilter, setTaskMonthFilter] = useState("all");
    const [taskSort, setTaskSort] = useState("date-desc");
    const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | "complete" | "incomplete">("all");
    const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(new Set());
    const [savedData, setSavedData] = useState<SavedData[]>([]);

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? NO_IDS;
    const instructors = context?.instructors ?? NO_IDS;
    const setRoleNotification = context?.setRoleNotification ?? null;
    const isCurrentRole = !!roleId && userData?.currentRole === roleId;
    const isMember = liveRole === undefined ? null : !!user && !!liveRole && (liveRole.members ?? []).includes(user.uid);
    const isAdmin = !!user && admins.includes(user.uid);
    const canManage = canManageRole(role, user?.uid, admins, instructors);
    // Admins and this role's instructors run it rather than take part, so they get no Tasks tab and no ranking
    const isStaff = !!user && isRoleStaff(role, user.uid, admins);

    // Get role rewards
    useEffect(() => {
        if (!role?.id) return;

        const rewardRef = doc(db, "rewards", role.id);
        const unsub = onSnapshot(rewardRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setRewards([
                    data.first || "No reward set",
                    data.second || "No reward set",
                    data.third || "No reward set",
                ]);
            } else {
                setRewards(["No reward set", "No reward set", "No reward set"]);
            }
        });

        return () => unsub();
    }, [role?.id])

    // Update Leaderboard (admins and the role's instructors aren't ranked)
    useEffect(() => {
        const sorted = membersWithData
            .filter(m => !isRoleStaff(role, m.uid, admins))
            .sort((a, b) => (b.points || 0) - (a.points || 0));
        setLeaders(sorted);
    }, [membersWithData, role, admins]);

    // Get User Tasks
    useEffect(() => {
        if (!roleId || !user) {
            setTasksLoading(false);
            return;
        }

        setTasksLoading(true);
        const q = query(
            collection(db, "tasks"),
            where("roleId", "==", roleId),
            where("assignedTo", "==", user.uid)
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                setUserTasks(
                snap.docs.map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as Omit<Task, "id">),
                }))
                );
                setTasksLoading(false);
            },
            (err) => {
                console.error("Error fetching tasks:", err);
                setTasksLoading(false);
            }
        );

        return () => unsub();
    }, [roleId, user]);

    // Getting the current role's submitted tasks
    useEffect(() => {
        if (!roleId) return;
        const q = query(
            collection(db, "tasksSubmitted"),
            where("roleId", "==", roleId),
            where("complete", "==", false)
        )

        const unsub = onSnapshot(q, (snap) => {
            setSubmittedTasks(
                snap.docs.map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as Omit<SubmittedTask, "id">),
                }))
            )
        })
        return () => unsub();
    }, [roleId]);

    // Saved Data: leaderboards saved each time the role was reset
    useEffect(() => {
        if (!roleId) return;
        // Sorted client-side (rather than via orderBy) so this doesn't need a composite index on roleId+createdAt
        const q = query(collection(db, "leaderboardSnapshots"), where("roleId", "==", roleId));
        const unsub = onSnapshot(q, (snap) => {
            const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedData));
            results.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
            setSavedData(results);
        }, (error) => {
            console.error("Error loading saved data:", error);
        });
        return () => unsub();
    }, [roleId]);

    useEffect(() => {
        if (!loading && liveRole !== undefined && !isMember) {
            navigate("/roles", { replace: true });
        }
    }, [isMember, liveRole, loading, navigate]);

    useEffect(() => {
        if (!user) return;
        const stored = localStorage.getItem(`stemup_seen_tasks_${user.uid}`);
        if (stored) setSeenTaskIds(new Set(JSON.parse(stored)));
    }, [user]);

    useEffect(() => {
        if (!user || !setRoleNotification) return;
        if (canManage) {
            setRoleNotification(requested.length > 0 || submittedTasks.length > 0);
        } else {
            setRoleNotification(userTasks.some(t => !t.complete && !seenTaskIds.has(t.id) && !submittedTasks.some(s => s.id === t.id)));
        }
    }, [user, canManage, requested, submittedTasks, userTasks, seenTaskIds, setRoleNotification]);

    useEffect(() => {
        return () => { setRoleNotification?.(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setCurrentRole = async (id : string) => {
        if (!user) return;
        await updateDoc(doc(db, "users", user.uid), { currentRole: id });
    }

    const setTaskStatus = async (taskId: string, status: string) => {
        await updateDoc(doc(db, "tasks", taskId), { status });
    };

    const requestExtension = async (taskId: string) => {
        await updateDoc(doc(db, "tasks", taskId), { extensionRequested: true });
    };

    const markTaskSeen = (taskId: string) => {
        if (!user || seenTaskIds.has(taskId)) return;
        const updated = new Set(seenTaskIds);
        updated.add(taskId);
        setSeenTaskIds(updated);
        localStorage.setItem(`stemup_seen_tasks_${user.uid}`, JSON.stringify([...updated]));
    };

    const MONTH_OPTIONS = Array.from({ length: 13 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        return {
            label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
            key: `${d.getFullYear()}-${d.getMonth()}`,
        };
    });

    const isTaskOverdue = (task: Task) =>
        !task.complete && !!task.dueDate && task.dueDate.toDate() < new Date();

    const daysUntilDeletion = (task: Task): number | null => {
        if (!task.deleteAt) return null;
        return Math.ceil((task.deleteAt.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    if (loading || isMember === null) return <Loading />;
    if (!isMember || !user || !role ) return null;

    // The role's instructors who still have Instructor access, in the order they were added
    const roleInstructors = (role.instructors ?? [])
        .filter(uid => instructors.includes(uid))
        .map(uid => membersWithData.find(m => m.uid === uid))
        .filter((m): m is UserData => !!m);

    const taskCount = userTasks.filter(task => !task.complete && !submittedTasks.some(s => s.id === task.id)).length;
    const hasNewTasks = !isStaff && userTasks.some(t => !t.complete && !seenTaskIds.has(t.id) && !submittedTasks.some(s => s.id === t.id));

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-10">
            {/* Breadcrumb / back nav */}
            <div className="flex items-center justify-between pt-1">
                <button
                    onClick={() => navigate("/roles")}
                    className="flex items-center gap-1.5 pl-2.5 pr-4 py-1.5 rounded-full text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors hover:cursor-pointer group"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Roles
                </button>
                <button
                    type="button"
                    title="Role ID (click to copy)"
                    onClick={copyRoleId}
                    className="inline-flex items-center gap-1.5 min-w-0 text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 cursor-pointer hover:border-gray-300 hover:text-gray-500 transition-colors"
                >
                    <span className="truncate">{roleId}</span>
                    <FontAwesomeIcon icon={idCopied ? faCheck : faCopy} className={`shrink-0 ${idCopied ? "text-green-500" : ""}`} aria-label={idCopied ? "Copied" : "Copy"} />
                </button>
            </div>

            {/* Role header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Role</p>
                    <h1 className="text-2xl font-bold">{role.name}</h1>
                </div>
                <div className="flex items-center gap-3">
                    {membersWithData.map((m) => {
                        if (m.id === user.uid && !isStaff) {
                            return Object.values(m.roles || {}).map((x) => {
                                if (x.id === role.id) {
                                    return (
                                        <div key={x.id} className="flex gap-3 text-sm text-gray-600">
                                            <span><strong className="text-black">{x.points}</strong> pts</span>
                                            <span><strong className="text-black">{x.taskCompleted}</strong> tasks</span>
                                        </div>
                                    );
                                }
                                return null;
                            });
                        }
                        return null;
                    })}
                    {isAdmin ? (
                        <Button size="xsm" color="blue" onClick={() => navigate(`/admin/roles/${role.id}`)}>Manage</Button>
                    ) : canManage ? (
                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Instructor</span>
                    ) : null}
                    {isCurrentRole ?
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full"
                        >
                            Your Role
                        </motion.span>
                        :
                        <Button size="xsm" onClick={() => setCurrentRole(role.id)}>Set Role</Button>
                    }
                </div>
            </div>

            {/* Who runs this role */}
            {roleInstructors.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mt-1">
                    <span className="text-xs text-gray-400 uppercase tracking-widest mr-1">
                        Instructor{roleInstructors.length === 1 ? "" : "s"}
                    </span>
                    {roleInstructors.map(m => (
                        <button
                            key={m.uid}
                            onClick={() => context?.setShowAccount(m)}
                            className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 pl-1 pr-2.5 py-1 rounded-full text-sm font-medium hover:border-purple-400 transition-colors hover:cursor-pointer"
                        >
                            <ProfileImg src={m.photoURL} alt={m.name} size="xxs" />
                            <span className="truncate max-w-40">{m.name}{m.uid === user.uid ? " (you)" : ""}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Tab bar */}
            <div ref={tabBar.ref} className="relative flex items-center gap-0.5 sm:gap-1 border-b border-gray-200 overflow-x-auto scrollbar-hide w-full pt-2">
                <span aria-hidden className={`${tabBar.indicatorClass} bg-blue-600`} style={tabBar.indicatorStyle} />
                {[
                    { key: "leaderboard", label: "Leaderboard" },
                    { key: "rewards", label: "Rewards" },
                    { key: "saved", label: "Saved Data" },
                    ...(!isStaff ? [{ key: "tasks", label: "Tasks" }] : []),
                    ...(canManage && !isAdmin ? [{ key: "admin", label: "Instructor" }] : []),
                ].map((tab) => (
                    <div key={tab.key} data-active={pageState === tab.key ? "true" : "false"} className="relative shrink-0">
                        <button
                            onClick={() => setPageState(tab.key)}
                            className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors hover:cursor-pointer ${
                                pageState === tab.key
                                    ? "text-blue-600"
                                    : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            {tab.label}
                            {tab.key === "tasks" && (
                                hasNewTasks
                                    ? <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                                    : taskCount > 0
                                    ? <span className="ml-1.5 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">{taskCount}</span>
                                    : null
                            )}
                            {tab.key === "admin" && (requested.length > 0 || submittedTasks.length > 0) && (
                                <span className="absolute top-1 right-0.5 flex size-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                    <span className="relative inline-flex size-2.5 rounded-full bg-sky-500"></span>
                                </span>
                            )}
                        </button>
                    </div>
                ))}
            </div>

            {/* Leaderboard */}
            {pageState.match("leaderboard") && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2"
                >
                    {leaders.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No members yet.</p>}

                    {/* Podium for top 3 */}
                    {(() => {
                        const top = leaders.slice(0, 3);
                        if (top.length === 0) return null;

                        const podiumOrder = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd
                        const podiumConfig = [
                            { rank: 2, barH: "h-16", avatarSize: "sm", textSize: "text-sm", mt: "mt-8", avatarClass: "size-24" },
                            { rank: 1, barH: "h-24", avatarSize: "md", textSize: "text-base", mt: "mt-0", avatarClass: "size-34" },
                            { rank: 3, barH: "h-10", avatarSize: "xs", textSize: "text-xs", mt: "mt-14", avatarClass: "size-14" },
                        ];

                        return (
                            <div className="flex items-end justify-center gap-2 sm:gap-4 mb-4 px-2">
                                {podiumOrder.map((u, idx) => {
                                    const cfg = podiumConfig[idx];
                                    if (!u) return (
                                        <motion.div
                                            key={`ghost-${idx}`}
                                            className={`flex-1 flex flex-col items-center gap-1 ${cfg.mt}`}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <span className="text-lg opacity-0"><MedalIcon rank={cfg.rank - 1} /></span>
                                            <div className={`${cfg.avatarClass} shrink-0 aspect-square rounded-full bg-gray-100 border-2 border-dashed border-gray-300`} />
                                            <p className={`font-semibold text-center ${cfg.textSize} text-gray-300`}>—</p>
                                            <p className={`${cfg.textSize} text-gray-200`}>— pts</p>
                                            <div className={`w-full ${cfg.barH} rounded-t-xl flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200`}>
                                                <span className="font-bold text-gray-300 text-sm">{cfg.rank}</span>
                                            </div>
                                        </motion.div>
                                    );
                                    const isMe = u.id === user.uid;
                                    return (
                                        <motion.div
                                            key={u.id}
                                            className={`flex-1 flex flex-col items-center gap-1 ${cfg.mt}`}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <span className="text-lg"><MedalIcon rank={cfg.rank - 1} /></span>
                                            <motion.div
                                                className="flex flex-col items-center gap-1 cursor-pointer"
                                                whileHover={{ scale: 1.05 }}
                                                onClick={() => context?.setShowAccount(u)}
                                            >
                                            <ProfileImg src={u.photoURL} alt={u.name} size={cfg.avatarSize} />
                                            <p className={`font-semibold text-center truncate w-full ${cfg.textSize}`}>{u.name}</p>
                                            </motion.div>
                                            <p className={`text-gray-500 ${cfg.textSize} pointer-events-none`}><strong className="text-black">{u.points}</strong> pts</p>
                                            <div className={`w-full ${cfg.barH} rounded-t-xl flex items-center justify-center ${
                                                cfg.rank === 1
                                                    ? isMe ? "bg-yellow-200 border-2 border-yellow-400" : "bg-yellow-100 border-2 border-yellow-300"
                                                    : cfg.rank === 2
                                                    ? isMe ? "bg-gray-200 border-2 border-gray-400" : "bg-gray-100 border-2 border-gray-200"
                                                    : isMe ? "bg-orange-200 border-2 border-orange-400" : "bg-orange-50 border-2 border-orange-200"
                                            }`}>
                                                <span className="font-bold text-gray-500 text-sm">{cfg.rank}</span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* Rest of the list (4th+) */}
                    {leaders.slice(3).map((u, idx) => {
                        const rank = idx + 4;
                        return (
                            <div
                                key={u.id}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                                    u.id === user.uid
                                        ? "bg-blue-50 border-blue-200"
                                        : "bg-white border-gray-100 hover:border-gray-300"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="w-6 text-sm font-bold text-center text-gray-400">{rank}</span>
                                    <ProfileButton user={u} size="xxs" />
                                </div>
                                <div className="flex gap-4 text-sm text-gray-600">
                                    <span><strong className="text-black">{u.points}</strong> pts</span>
                                    <span className="hidden sm:inline"><strong className="text-black">{u.taskCompleted}</strong> tasks</span>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            )}

            {/* Rewards */}
            {pageState.match("rewards") && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3"
                >
                    <h2 className="text-lg font-semibold">{role.rewardsTitle?.trim() || `${currentMonth} Rewards`}</h2>
                    {["First", "Second", "Third"].map((label, idx) => {
                        const winner = leaders[idx];
                        return (
                            <div key={label} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl"><MedalIcon rank={idx} /></span>
                                    <div>
                                        <p className="font-semibold">{label} Place</p>
                                        <p className="text-sm text-gray-500">{winner ? winner.name : "No user yet"}</p>
                                    </div>
                                </div>
                                <p className="text-sm font-medium text-gray-700">{rewards[idx] ?? "No reward set"}</p>
                            </div>
                        );
                    })}
                </motion.div>
            )}

            {/* Saved Data */}
            {pageState === "saved" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                >
                    {savedData.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">Nothing saved yet. Each time this role is reset, its leaderboard is saved here.</p>
                    ) : savedData.map(save => (
                        <div key={save.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                            <div>
                                <h3 className="font-semibold">{save.name || save.month || "Saved Data"}</h3>
                                <p className="text-xs text-gray-400">
                                    Reset {save.createdAt?.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                </p>
                            </div>
                            {(save.entries ?? []).length === 0 ? (
                                <p className="text-sm text-gray-400">No entries.</p>
                            ) : save.entries.map(entry => (
                                <div key={entry.uid} className="flex items-center justify-between px-2 py-1.5">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-6 text-center text-sm font-bold text-gray-400">
                                            {entry.rank <= 3 ? <MedalIcon rank={entry.rank - 1} /> : entry.rank}
                                        </span>
                                        <span className="font-medium text-sm truncate">{entry.name}</span>
                                    </div>
                                    <div className="flex gap-3 text-sm text-gray-600 shrink-0">
                                        <span><strong className="text-black">{entry.points}</strong> pts</span>
                                        <span><strong className="text-black">{entry.taskCompleted}</strong> tasks</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Tasks */}
            {pageState.match("tasks") && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3"
                >
                    <h2 className="text-lg font-semibold">Your Tasks</h2>
                    {/* Search + Month filter */}
                    <div className="flex flex-col gap-2">
                        <input
                            type="text"
                            value={taskSearch}
                            onChange={e => setTaskSearch(e.target.value)}
                            placeholder="Search tasks..."
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        />
                        <select
                            value={taskMonthFilter}
                            onChange={e => setTaskMonthFilter(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        >
                            <option value="all">All months</option>
                            {MONTH_OPTIONS.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                        </select>
                        <div className="flex gap-2 flex-wrap">
                            {([
                                { key: "date-desc", label: "Newest" },
                                { key: "date-asc",  label: "Oldest" },
                                { key: "title-asc", label: "A-Z" },
                                { key: "title-desc", label: "Z-A" },
                            ]).map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setTaskSort(s.key)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors hover:cursor-pointer ${
                                        taskSort === s.key
                                            ? "bg-gray-700 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {([
                                { key: "all", label: "All" },
                                { key: "incomplete", label: "Not Completed" },
                                { key: "complete", label: "Completed" },
                            ] as const).map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setTaskStatusFilter(f.key)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors hover:cursor-pointer ${
                                        taskStatusFilter === f.key
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {tasksLoading ? (
                        <p className="text-gray-400 text-sm">Loading tasks...</p>
                    ) : (() => {
                        const filtered = userTasks.filter(task => {
                            if (taskStatusFilter === "complete" && !task.complete) return false;
                            if (taskStatusFilter === "incomplete" && task.complete) return false;
                            if (taskMonthFilter !== "all") {
                                const [y, m] = taskMonthFilter.split("-").map(Number);
                                const d = task.createdOn?.toDate();
                                if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
                            }
                            if (taskSearch) {
                                const q = taskSearch.toLowerCase();
                                if (!task.title.toLowerCase().includes(q) && !(task.description || "").toLowerCase().includes(q)) return false;
                            }
                            return true;
                        });
                        const sorted = [...filtered].sort((a, b) => {
                            if (taskSort === "title-asc") return a.title.localeCompare(b.title);
                            if (taskSort === "title-desc") return b.title.localeCompare(a.title);
                            const aMs = a.createdOn?.toDate().getTime() ?? 0;
                            const bMs = b.createdOn?.toDate().getTime() ?? 0;
                            return taskSort === "date-asc" ? aMs - bMs : bMs - aMs;
                        });
                        if (sorted.length === 0 || isStaff) return (
                            <p className="text-gray-400 text-sm py-8 text-center">No tasks assigned to you yet.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sorted.map((task) => {
                                    const overdue = isTaskOverdue(task);
                                    const daysLeft = daysUntilDeletion(task);
                                    const isSubmitted = submittedTasks.some(s => s.id === task.id);
                                    return (
                                        <motion.div
                                            key={task.id}
                                            onMouseEnter={() => markTaskSeen(task.id)}
                                            className={`flex flex-col gap-3 p-4 rounded-2xl border-2 bg-white ${
                                                task.complete ? "border-green-400" : overdue ? "border-red-300" : "border-gray-200"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <h3 className="font-semibold leading-tight truncate">{task.title}</h3>
                                                    {!task.complete && !isSubmitted && !seenTaskIds.has(task.id) && (
                                                        <span className="text-xs font-bold text-red-500 shrink-0">NEW</span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                                    {task.points} pts
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 flex-1">{task.description || "No description"}</p>
                                            {overdue && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-red-500">
                                                        Overdue{daysLeft !== null && ` · ${daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Expiring soon"}`}
                                                    </span>
                                                    {!task.extensionRequested && !task.extensionDeclined && (
                                                        <button
                                                            onClick={() => requestExtension(task.id)}
                                                            className="text-xs text-blue-500 hover:text-blue-700 font-medium text-left hover:cursor-pointer"
                                                        >
                                                            Request Extension
                                                        </button>
                                                    )}
                                                    {task.extensionRequested && (
                                                        <span className="text-xs text-yellow-600 font-medium">Requested Extension</span>
                                                    )}
                                                    {task.extensionDeclined && (
                                                        <span className="text-xs text-gray-400 font-medium">Extension Declined</span>
                                                    )}
                                                    {(task.declineCount ?? 0) > 0 && (
                                                        <span className="text-xs text-red-400 font-medium">
                                                            Declined {task.declineCount} time{task.declineCount === 1 ? "" : "s"}
                                                            {task.declineCount === 3 ? " · Task closed" : ""}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {task.dueDate && !task.complete && !overdue && (
                                                <p className="text-xs text-gray-400">
                                                    Due: {task.dueDate.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </p>
                                            )}
                                            {!task.complete && !overdue && !isSubmitted && (
                                                <select
                                                    value={task.status ?? ""}
                                                    onChange={e => setTaskStatus(task.id, e.target.value)}
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                                >
                                                    <option value="">Set status...</option>
                                                    <option value="In Progress">In Progress</option>
                                                    <option value="Almost Done">Almost Done</option>
                                                </select>
                                            )}
                                            {!overdue && <DoneButton task={task} />}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </motion.div>
            )}

            {/* Admin */}
            {pageState === "admin" && canManage && !isAdmin && (
                <RoleAdminPage
                    role={role}
                    membersWithData={membersWithData}
                    requested={requested}
                />
            )}
        </div>
    )
}