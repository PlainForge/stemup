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

    interface SnapshotEntry { uid: string; name: string; photoURL: string; points: number; taskCompleted: number; rank: number; }
    interface LeaderboardSnapshot { id: string; roleId: string; month: string; createdAt: Timestamp; entries: SnapshotEntry[]; }
    const [snapshots, setSnapshots] = useState<LeaderboardSnapshot[]>([]);

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
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

    const setCurrentRole = async (id : string) => {
        if (!user) return;
        await updateDoc(doc(db, "users", user.uid), { currentRole: id });
    }

    const setTaskStatus = async (taskId: string, status: string) => {
        await updateDoc(doc(db, "tasks", taskId), { status });
    };

    if (loading || isMember === null) return <Loading />;
    if (!isMember || !user || !role ) return null;

    const taskCount = userTasks.filter(task => !task.complete).length;

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-10">
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
                            {tab.key === "tasks" && taskCount > 0 && (
                                <span className="ml-1.5 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">{taskCount}</span>
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
                            { rank: 2, medal: "🥈", barH: "h-16", avatarSize: "sm", textSize: "text-sm", mt: "mt-8" },
                            { rank: 1, medal: "🥇", barH: "h-24", avatarSize: "md", textSize: "text-base", mt: "mt-0" },
                            { rank: 3, medal: "🥉", barH: "h-10", avatarSize: "xs", textSize: "text-xs", mt: "mt-14" },
                        ];

                        return (
                            <div className="flex items-end justify-center gap-2 sm:gap-4 mb-4 px-2">
                                {podiumOrder.map((u, idx) => {
                                    if (!u) return <div key={idx} className="flex-1" />;
                                    const cfg = podiumConfig[idx];
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
                    <h2 className="text-lg font-semibold">Your {currentMonth} Tasks</h2>
                    {tasksLoading ? (
                        <p className="text-gray-400 text-sm">Loading tasks...</p>
                    ) : userTasks.length > 0 && !admins.includes(user.uid) ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {userTasks.map((task) => (
                                <motion.div
                                    key={task.id}
                                    className={`flex flex-col gap-3 p-4 rounded-2xl border-2 bg-white ${
                                        task.complete ? "border-green-400" : "border-gray-200"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-semibold leading-tight">{task.title}</h3>
                                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                                            {task.points} pts
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 flex-1">{task.description || "No description"}</p>
                                    {!task.complete && (
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
                                    <DoneButton task={task} />
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-sm py-8 text-center">No tasks assigned to you yet.</p>
                    )}
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