import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { type Task, type UserData, type SubmittedTask, type SavedData } from "../myDataTypes";
import { useRole } from "../lib/useRole";
import { canManageRole, isRoleStaff, roleService } from "../lib/roleService";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Loading from "./Loading";
import { MainContext } from "../context/MainContext";
import Button from "../components/Button";
import ProfileButton from "../components/ProfileButton";
import ProfileImg from "../components/ProfileImg";
import MedalIcon from "../components/MedalIcon";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownAZ, faArrowDownWideShort, faArrowDownZA, faArrowUpWideShort, faBell, faBellSlash, faCalendar, faCalendarDays, faCheck, faChevronRight, faCopy, faHomeAlt, faIdCard, faMagnifyingGlass, faStar, faXmark } from "@fortawesome/free-solid-svg-icons";
import BackButton from "../components/BackButton";
import { splitLeaderboard } from "../lib/leaderboard";
import Dropdown from "../components/Dropdown";
import RoleIcon from "../components/RoleIcon";
import MemberTaskCard from "../components/MemberTaskCard";
import ChatPanel from "../components/ChatPanel";
import { chatSeenAt, listenLatestMessage, markChatSeen, roleChatPath } from "../lib/messages";


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
    // The open tab lives in the URL (?view=), so coming back from a member's page lands on the same tab
    const [searchParams, setSearchParams] = useSearchParams();
    const pageState = searchParams.get("view") ?? "leaderboard";
    const setPageState = (view: string) => setSearchParams(p => {
        const next = new URLSearchParams(p);
        next.set("view", view);
        next.delete("tab");
        return next;
    }, { replace: true });
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
    // The group chat's newest message, and when this person last looked (for the dot on its tab)
    const [latestChat, setLatestChat] = useState<{ at: number; by: string } | null>(null);
    const [chatSeen, setChatSeen] = useState(0);

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
            .sort((a, b) => (b.points || 0) - (a.points || 0) || (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
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

    // Group chat (when its owner or an admin has turned it on): watch for new messages
    const chatOn = role?.chatEnabled === true;
    useEffect(() => {
        if (!chatOn || !roleId || !user) {
            setLatestChat(null);
            return;
        }
        setChatSeen(chatSeenAt(user.uid, roleId));
        return listenLatestMessage(roleChatPath(roleId), m => setLatestChat(m ? { at: m.createdAt?.toMillis() ?? Date.now(), by: m.uid } : null));
    }, [chatOn, roleId, user]);
    // Reading the chat marks it seen
    useEffect(() => {
        if (pageState !== "chat" || !latestChat || !user || !roleId) return;
        markChatSeen(user.uid, roleId, latestChat.at);
        setChatSeen(s => Math.max(s, latestChat.at));
    }, [pageState, latestChat, user, roleId]);
    const chatUnread = chatOn && !!latestChat && latestChat.by !== user?.uid && latestChat.at > chatSeen && pageState !== "chat";

    useEffect(() => {
        if (!loading && liveRole !== undefined && !isMember) {
            navigate("/roles", { replace: true });
        }
    }, [isMember, liveRole, loading, navigate]);

    // The role's instructors run it from the Instructor tab now; old ?view=admin links go there
    const subTab = searchParams.get("tab");
    useEffect(() => {
        if (pageState !== "admin" || !roleId || liveRole === undefined) return;
        if (canManage && !isAdmin) navigate(`/instructor/roles/${roleId}${subTab ? `?tab=${subTab}` : ""}`, { replace: true });
        else if (isAdmin) navigate(`/admin/roles/${roleId}${subTab ? `?tab=${subTab}` : ""}`, { replace: true });
    }, [pageState, roleId, liveRole, canManage, isAdmin, subTab, navigate]);

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

    // Notifications about this role are on unless turned off in its Settings tab
    const roleNotificationsOn = !!roleId && userData?.notifications?.roles?.[roleId] !== false;
    const toggleRoleNotifications = async () => {
        if (!user || !roleId) return;
        await roleService.setRoleNotifications(user.uid, roleId, !roleNotificationsOn);
    };
    // This role's rewards and top 3 show on Home unless hidden in its Settings tab
    const showOnHome = !!roleId && !(userData?.hideOnHome ?? []).includes(roleId);
    const toggleShowOnHome = async () => {
        if (!user || !roleId) return;
        await roleService.setShowOnHome(user.uid, roleId, !showOnHome);
    };
    // This role shows on their card and user page unless hidden here
    const showOnProfile = !!roleId && !(userData?.hideOnProfile ?? []).includes(roleId);
    const toggleShowOnProfile = async () => {
        if (!user || !roleId) return;
        await roleService.setShowOnProfile(user.uid, roleId, !showOnProfile);
    };

    // Their default role opens when they log in (stored as currentRole)
    const toggleDefaultRole = async () => {
        if (!user || !roleId) return;
        await updateDoc(doc(db, "users", user.uid), { currentRole: isCurrentRole ? "" : roleId });
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

    if (loading || isMember === null) return <Loading />;
    if (!isMember || !user || !role ) return null;

    // The role's instructors who still have Instructor access, in the order they were added
    const roleInstructors = (role.instructors ?? [])
        .filter(uid => instructors.includes(uid))
        .map(uid => membersWithData.find(m => m.uid === uid))
        .filter((m): m is UserData => !!m);

    const board = splitLeaderboard(leaders);
    const taskCount = userTasks.filter(task => !task.complete && !submittedTasks.some(s => s.id === task.id)).length;
    const hasNewTasks = !isStaff && userTasks.some(t => !t.complete && !seenTaskIds.has(t.id) && !submittedTasks.some(s => s.id === t.id));

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-10">
            {/* Breadcrumb / back nav */}
            <div className="flex items-center justify-between pt-1">
                <BackButton label="Roles" onClick={() => navigate("/roles")} />
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
                <div className="flex items-center gap-3 min-w-0">
                    <RoleIcon role={role} size="lg" solid />
                    <div className="min-w-0">
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Role</p>
                        <h1 className="text-2xl font-bold truncate">{role.name}</h1>
                    </div>
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
                    {/* Admins manage the role from the Admin tab, its instructors from the Instructor tab */}
                    {isAdmin ? (
                        <Button size="xsm" color="blue" onClick={() => navigate(`/admin/roles/${role.id}`)}>Manage</Button>
                    ) : canManage ? (
                        <span className="relative inline-flex">
                            <Button size="xsm" color="blue" onClick={() => navigate(`/instructor/roles/${role.id}`)}>Manage</Button>
                            {(requested.length > 0 || submittedTasks.length > 0) && (
                                <span className="absolute -top-1 -right-1 flex size-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                    <span className="relative inline-flex size-2.5 rounded-full bg-sky-500"></span>
                                </span>
                            )}
                        </span>
                    ) : null}
                    {/* Their default role (picked in this role's Settings tab) opens when they log in */}
                    {isCurrentRole && (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                        >
                            <FontAwesomeIcon icon={faStar} className="text-[10px]" />
                            Default Role
                        </motion.span>
                    )}
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
                    ...(chatOn ? [{ key: "chat", label: "Chat" }] : []),
                    { key: "settings", label: "Settings" },
                ].map((tab) => {
                    // The Notifications page sits inside Settings
                    const active = pageState === tab.key || (tab.key === "settings" && pageState === "notifications");
                    return (
                    <div key={tab.key} data-active={active ? "true" : "false"} className="relative shrink-0">
                        <button
                            onClick={() => setPageState(tab.key)}
                            className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors hover:cursor-pointer ${
                                active
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
                            {tab.key === "chat" && chatUnread && (
                                <span className="ml-1.5 inline-block size-2 rounded-full bg-red-500 align-middle" aria-label="New messages" />
                            )}
                            {tab.key === "settings" && !roleNotificationsOn && (
                                <FontAwesomeIcon icon={faBellSlash} className="ml-1.5 text-gray-400" aria-label="Notifications off" />
                            )}
                        </button>
                    </div>
                    );
                })}
            </div>

            {/* Leaderboard */}
            {pageState.match("leaderboard") && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2"
                >
                    {leaders.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No members yet.</p>}

                    {/* Podium for top 3 (only people who've earned a point or finished a task) */}
                    {(() => {
                        const top = board.podium;
                        if (leaders.length === 0) return null;

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
                                            className={`group flex-1 flex flex-col items-center gap-1 cursor-pointer select-none ${cfg.mt}`}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            onClick={() => context?.setShowAccount(u)}
                                        >
                                            <span className="text-lg"><MedalIcon rank={cfg.rank - 1} /></span>
                                            <motion.div
                                                className="flex flex-col items-center gap-1"
                                                whileHover={{ scale: 1.05 }}
                                            >
                                            <ProfileImg src={u.photoURL} alt={u.name} size={cfg.avatarSize} />
                                            <p className={`font-semibold text-center truncate w-full ${cfg.textSize}`}>{u.name}</p>
                                            </motion.div>
                                            <p className={`text-gray-500 ${cfg.textSize} pointer-events-none`}><strong className="text-black">{u.points}</strong> pts</p>
                                            <div className={`w-full ${cfg.barH} rounded-t-xl flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 ${
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
                    {board.rest.map((u, idx) => {
                        const rank = idx + 4;
                        return (
                            <div
                                key={u.id}
                                // The whole row opens their profile, same as clicking the name
                                onClick={() => context?.setShowAccount(u)}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all hover:cursor-pointer hover:shadow-sm ${
                                    u.id === user.uid
                                        ? "bg-blue-50 border-blue-200 hover:border-blue-300"
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
                        const winner = board.podium[idx];
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
                    {/* Search, month and sort (the same controls as the instructor's Tasks tab) */}
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 transition-colors hover:border-gray-400 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-gray-400" />
                            <input
                                type="text"
                                value={taskSearch}
                                onChange={e => setTaskSearch(e.target.value)}
                                placeholder="Search tasks..."
                                aria-label="Search tasks"
                                className="w-full min-w-0 bg-transparent text-sm focus:outline-none"
                            />
                            {taskSearch && (
                                <button
                                    type="button"
                                    onClick={() => setTaskSearch("")}
                                    aria-label="Clear search"
                                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                                </button>
                            )}
                        </label>
                        <div className="flex flex-col min-[420px]:flex-row gap-2">
                            <div className="flex-1 min-w-0">
                                <Dropdown
                                    label="Month"
                                    fullWidth
                                    tone="gray"
                                    value={taskMonthFilter}
                                    onChange={setTaskMonthFilter}
                                    options={[
                                        { value: "all", label: "All months", icon: faCalendarDays },
                                        ...MONTH_OPTIONS.map(opt => ({ value: opt.key, label: opt.label, icon: faCalendar })),
                                    ]}
                                />
                            </div>
                            <div className="min-[420px]:w-44 shrink-0">
                                <Dropdown
                                    label="Sort"
                                    fullWidth
                                    tone="gray"
                                    value={taskSort}
                                    onChange={setTaskSort}
                                    options={[
                                        { value: "date-desc", label: "Newest first", icon: faArrowDownWideShort },
                                        { value: "date-asc", label: "Oldest first", icon: faArrowUpWideShort },
                                        { value: "title-asc", label: "Title A–Z", icon: faArrowDownAZ },
                                        { value: "title-desc", label: "Title Z–A", icon: faArrowDownZA },
                                    ]}
                                />
                            </div>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sorted.map((task) => {
                                    const isSubmitted = submittedTasks.some(s => s.id === task.id);
                                    return (
                                        <motion.div key={task.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                            <MemberTaskCard
                                                task={task}
                                                isSubmitted={isSubmitted}
                                                isNew={!task.complete && !isSubmitted && !seenTaskIds.has(task.id)}
                                                onSeen={() => markTaskSeen(task.id)}
                                                threads={role.taskThreadsEnabled === true}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </motion.div>
            )}

            {/* Group chat, for everyone in the role (turned on by its owner or an admin) */}
            {pageState === "chat" && chatOn && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                    <ChatPanel
                        path={roleChatPath(role.id)}
                        canPost
                        canModerate={canManage}
                        className="h-[65vh] min-h-80"
                        placeholder={`Message ${role.name}...`}
                        emptyText={`No messages yet. Everyone in ${role.name} can read and write here.`}
                    />
                    <p className="text-xs text-gray-400 text-center">Everyone in {role.name} can see these messages. New ones show up as notifications in the iOS app.</p>
                </motion.div>
            )}

            {/* Settings for this role: its Notifications page, whether it's their default role, and
                whether it shows on Home. Settings and its Notifications page slide between each other. */}
            <AnimatePresence mode="wait" initial={false}>
            {pageState === "settings" && (
                <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                    className="flex flex-col gap-3"
                >
                    <button
                        type="button"
                        onClick={() => setPageState("notifications")}
                        className="group bg-white border border-gray-100 hover:border-gray-300 rounded-2xl p-4 flex items-center gap-3 text-left transition-colors hover:cursor-pointer"
                    >
                        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${roleNotificationsOn ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                            <FontAwesomeIcon icon={roleNotificationsOn ? faBell : faBellSlash} />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold">Notifications</span>
                            <span className="block text-sm text-gray-500">{roleNotificationsOn ? "On" : "Off"}</span>
                        </span>
                        <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isCurrentRole ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" : "bg-gray-100 text-gray-400"}`}>
                                <FontAwesomeIcon icon={faStar} />
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold">Default Role</p>
                                <p className="text-sm text-gray-500">Open {role.name} when you log in</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isCurrentRole}
                            aria-label={`Make ${role.name} your default role`}
                            onClick={toggleDefaultRole}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${isCurrentRole ? "bg-green-500" : "bg-gray-300"}`}
                        >
                            <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${isCurrentRole ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${showOnHome ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                                <FontAwesomeIcon icon={faHomeAlt} />
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold">Show on Home</p>
                                <p className="text-sm text-gray-500">{role.name}'s rewards and top 3 on your Home page</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={showOnHome}
                            aria-label={`Show ${role.name} on Home`}
                            onClick={toggleShowOnHome}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${showOnHome ? "bg-green-500" : "bg-gray-300"}`}
                        >
                            <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${showOnHome ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${showOnProfile ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                                <FontAwesomeIcon icon={faIdCard} />
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold">Show on My Profile</p>
                                <p className="text-sm text-gray-500">
                                    {showOnProfile ? `${role.name} is listed on your card and user page` : `Hidden from your card and user page. Admins and ${role.name}'s instructors still see it.`}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={showOnProfile}
                            aria-label={`Show ${role.name} on your profile`}
                            onClick={toggleShowOnProfile}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${showOnProfile ? "bg-green-500" : "bg-gray-300"}`}
                        >
                            <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${showOnProfile ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Notifications for this role (opened from Settings) */}
            {pageState === "notifications" && (
                <motion.div
                    key="notifications"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                    className="flex flex-col gap-4"
                >
                    <BackButton label="Settings" onClick={() => setPageState("settings")} />
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${roleNotificationsOn ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                                    <FontAwesomeIcon icon={roleNotificationsOn ? faBell : faBellSlash} />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold">Notifications from {role.name}</p>
                                    <p className="text-sm text-gray-500">{roleNotificationsOn ? "On" : "Off"}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={roleNotificationsOn}
                                aria-label={`Notifications from ${role.name}`}
                                onClick={toggleRoleNotifications}
                                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${roleNotificationsOn ? "bg-green-500" : "bg-gray-300"}`}
                            >
                                <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${roleNotificationsOn ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-500">
                            Covers everything about this role: tasks, reviews, extensions and requests{canManage ? ", including submissions waiting for you to review" : ""}.
                            {" "}Turning it off stops push notifications and emails about this role only.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate("/settings/notifications")}
                            className="self-start text-sm font-medium text-blue-600 hover:text-blue-700 hover:cursor-pointer"
                        >
                            Choose how you're notified in Settings
                        </button>
                    </div>
                </motion.div>
            )}

            </AnimatePresence>
        </div>
    )
}