import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { type Task, type Role, type UserData, type UserRoleData, type SubmittedTask } from "../myDataTypes";
import { motion } from "motion/react";
import RoleAdminPage from "../components/RoleAdmin";
import DoneButton from "../components/TaskDoneButton";
import { useNavigate, useParams } from "react-router-dom";
import Loading from "./Loading";
import { MainContext } from "../context/MainContext";
import Button from "../components/Button";
import ProfileButton from "../components/ProfileButton";
import ProfileImg from "../components/ProfileImg";

export default function RolePage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();

    const { id: roleId } = useParams<{ id: string }>();
    const [members, setMembers] = useState<string[]>([]);
    const [membersWithData, setMembersWithData] = useState<UserData[]>([]);
    const [leaders, setLeaders] = useState<UserData[]>([]);
    const [userTasks, setUserTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("leaderboard");
    const [role, setRole] = useState<Role | null>(null);
    const [rewards, setRewards] = useState<string[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [isMember, setIsMember] = useState<boolean | null>(null);

    const [requested, setRequested] = useState<string[]>([]);
    const [submittedTasks, setSubmittedTasks] = useState<SubmittedTask[]>([]);
    const [taskSearch, setTaskSearch] = useState("");
    const [taskMonthFilter, setTaskMonthFilter] = useState("all");
    const [taskSort, setTaskSort] = useState("date-desc");
    const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | "complete" | "incomplete">("all");
    const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(new Set());

    interface SnapshotEntry { uid: string; name: string; photoURL: string; points: number; taskCompleted: number; rank: number; }
    interface LeaderboardSnapshot { id: string; roleId: string; month: string; createdAt: Timestamp; entries: SnapshotEntry[]; }
    const [snapshots, setSnapshots] = useState<LeaderboardSnapshot[]>([]);

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const setRoleNotification = context?.setRoleNotification ?? null;
    const isCurrentRole = !!roleId && userData?.currentRole === roleId;

    useEffect(() => {
        if (!roleId || !user) return;

        const roleRef = doc(db, "roles", roleId);

        const unsub = onSnapshot(roleRef, (snap) => {
            if (!snap.exists()) {
                setRole(null);
                setMembers([]);
                setIsMember(false);
                return;
            }

            const data = snap.data() as Omit<Role, "id"> & { members: string[]; pendingRequests: string[] };

            setRole({ id: snap.id, ...data });
            setMembers(data.members || []);
            setIsMember((data.members || []).includes(user.uid));
            setRequested(data.pendingRequests || []);
        });

        return unsub;
    }, [roleId, user]);

    useEffect(() => {
        setMembersWithData((prev) =>
            prev.filter((m) => members.includes(m.uid))
        );
    }, [members]);

    // Get Members
    useEffect(() => {
        if (members.length === 0 || !roleId) {
            setMembersWithData([]);
            return;
        }

        const unsubs = members.map((uid) => {
            const userRef = doc(db, "users", uid);
            return onSnapshot(userRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setMembersWithData((prev) => {
                        const updated = prev.filter((m) => m.id !== uid);
                        const roleData = Array.isArray(data.roles)
                        ? data.roles.find((r: UserRoleData) => r.id === roleId) || {}
                        : {};
                        return [
                            ...updated,
                            {
                                id: uid,
                                uid,
                                name: data.name || "Unknown User",
                                roles: data.roles || [],
                                points: roleData.points || 0,
                                taskCompleted: roleData.taskCompleted || 0,
                                photoURL: data.photoURL || "",
                                currentRole: data.currentRole || "",
                            },
                        ];
                    });
                }
            });
        });

        return () => unsubs.forEach((unsub) => unsub());
    }, [members, roleId]);

    // Get role rewards
    useEffect(() => {
        if (!role) return;

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
    }, [role])

    // Update Leaderboard
    useEffect(() => {
        if (!membersWithData.length) return;
        const sorted = [...membersWithData].sort(
            (a, b) => (b.points || 0) - (a.points || 0)
        );
        setLeaders(sorted);
    }, [membersWithData]);

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
        if (!role) return;
        const q = query(
            collection(db, "tasksSubmitted"),
            where("roleId", "==", role.id),
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
    }, [role, setSubmittedTasks]);

    // Get leaderboard snapshots for this role
    useEffect(() => {
        if (!roleId) return;
        const q = query(
            collection(db, "leaderboardSnapshots"),
            where("roleId", "==", roleId),
            orderBy("createdAt", "desc")
        );
        const unsub = onSnapshot(q, (snap) => {
            setSnapshots(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaderboardSnapshot)));
        });
        return () => unsub();
    }, [roleId]);

    useEffect(() => {
        if (!loading && role && !isMember) {
            navigate("/roles", { replace: true });
        }
    }, [isMember, role, loading, navigate]);

    useEffect(() => {
        if (!user) return;
        const stored = localStorage.getItem(`stemup_seen_tasks_${user.uid}`);
        if (stored) setSeenTaskIds(new Set(JSON.parse(stored)));
    }, [user]);

    useEffect(() => {
        if (!user || !setRoleNotification) return;
        const isAdmin = admins.includes(user.uid);
        if (isAdmin) {
            setRoleNotification(requested.length > 0 || submittedTasks.length > 0);
        } else {
            setRoleNotification(userTasks.some(t => !t.complete && !seenTaskIds.has(t.id)));
        }
    }, [user, admins, requested, submittedTasks, userTasks, seenTaskIds, setRoleNotification]);

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

    const taskCount = userTasks.filter(task => !task.complete).length;
    const hasNewTasks = !admins.includes(user.uid) && userTasks.some(t => !t.complete && !seenTaskIds.has(t.id));

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-10">
            {/* Breadcrumb / back nav */}
            <div className="flex items-center justify-between pt-1">
                <button
                    onClick={() => navigate("/roles")}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors hover:cursor-pointer group"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Roles
                </button>
                <span
                    title="Role ID (click to copy)"
                    onClick={() => navigator.clipboard.writeText(roleId ?? "")}
                    className="text-xs text-gray-300 font-mono bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 select-all cursor-pointer hover:border-gray-300 hover:text-gray-400 transition-colors"
                >
                    {roleId}
                </span>
            </div>

            {/* Role header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Role</p>
                    <h1 className="text-2xl font-bold">{role.name}</h1>
                </div>
                <div className="flex items-center gap-3">
                    {membersWithData.map((m) => {
                        if (m.id === user.uid && !admins.includes(user.uid)) {
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
                    {admins.includes(user.uid) && (
                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Admin View</span>
                    )}
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

            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-gray-200">
                {[
                    { key: "leaderboard", label: "Leaderboard" },
                    { key: "rewards", label: "Rewards" },
                    { key: "pastmonths", label: "Past Months" },
                    ...(!admins.includes(user.uid)
                        ? [{ key: "tasks", label: "Tasks" }]
                        : [{ key: "admin", label: "Admin" }]
                    ),
                ].map((tab) => (
                    <div key={tab.key} className="relative">
                        <button
                            onClick={() => setPageState(tab.key)}
                            className={`px-4 py-2.5 text-sm font-medium transition-colors hover:cursor-pointer ${
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
                                <span className="absolute -top-1 -right-1 flex size-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                    <span className="relative inline-flex size-2.5 rounded-full bg-sky-500"></span>
                                </span>
                            )}
                        </button>
                        {pageState === tab.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                        )}
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
                        const top = leaders.filter(u => !admins.includes(u.id)).slice(0, 3);
                        if (top.length === 0) return null;

                        const podiumOrder = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd
                        const podiumConfig = [
                            { rank: 2, medal: "🥈", barH: "h-16", avatarSize: "sm", textSize: "text-sm", mt: "mt-8", avatarClass: "size-24" },
                            { rank: 1, medal: "🥇", barH: "h-24", avatarSize: "md", textSize: "text-base", mt: "mt-0", avatarClass: "size-34" },
                            { rank: 3, medal: "🥉", barH: "h-10", avatarSize: "xs", textSize: "text-xs", mt: "mt-14", avatarClass: "size-14" },
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
                                            <span className="text-lg opacity-0">{cfg.medal}</span>
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
                                            <span className="text-lg">{cfg.medal}</span>
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
                    {leaders.filter(u => !admins.includes(u.id)).slice(3).map((u, idx) => {
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
                    <h2 className="text-lg font-semibold">{currentMonth} Rewards</h2>
                    {["First", "Second", "Third"].map((label, idx) => {
                        const filteredLeaders = leaders.filter((l) => !admins.includes(l.uid));
                        const winner = filteredLeaders[idx];
                        const medals = ["🥇", "🥈", "🥉"];
                        return (
                            <div key={label} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{medals[idx]}</span>
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

            {/* Past Months */}
            {pageState === "pastmonths" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                >
                    {snapshots.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No previous leaderboards yet.</p>
                    ) : snapshots.map(snap => (
                        <div key={snap.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">{snap.month}</h3>
                            {snap.entries.length === 0 ? (
                                <p className="text-sm text-gray-400">No entries.</p>
                            ) : snap.entries.map(entry => {
                                const medals = ["🥇", "🥈", "🥉"];
                                return (
                                    <div key={entry.uid} className="flex items-center justify-between px-2 py-1.5">
                                        <div className="flex items-center gap-3">
                                            <span className="w-6 text-center text-sm font-bold text-gray-400">
                                                {entry.rank <= 3 ? medals[entry.rank - 1] : entry.rank}
                                            </span>
                                            <span className="font-medium text-sm">{entry.name}</span>
                                        </div>
                                        <div className="flex gap-3 text-sm text-gray-600">
                                            <span><strong className="text-black">{entry.points}</strong> pts</span>
                                            <span className="hidden sm:inline"><strong className="text-black">{entry.taskCompleted}</strong> tasks</span>
                                        </div>
                                    </div>
                                );
                            })}
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
                                { key: "title-asc", label: "A → Z" },
                                { key: "title-desc", label: "Z → A" },
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
                        if (sorted.length === 0 || admins.includes(user.uid)) return (
                            <p className="text-gray-400 text-sm py-8 text-center">No tasks assigned to you yet.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sorted.map((task) => {
                                    const overdue = isTaskOverdue(task);
                                    const daysLeft = daysUntilDeletion(task);
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
                                                    {!task.complete && !seenTaskIds.has(task.id) && (
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
                                                </div>
                                            )}
                                            {task.dueDate && !task.complete && !overdue && (
                                                <p className="text-xs text-gray-400">
                                                    Due: {task.dueDate.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </p>
                                            )}
                                            {!task.complete && !overdue && (
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
            {pageState.match("admin") && (
                <RoleAdminPage
                    role={role}
                    membersWithData={membersWithData}
                    requested={requested}
                    setRequested={setRequested}
                />
            )}
        </div>
    )
}