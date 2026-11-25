import { useContext, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { roleService } from "../lib/roleService";
import { alertDialog, confirmDialog } from "../lib/confirm";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import { ACCESS_LABELS, type AccessLevel, type Role, type StemRequest, type UserRoleData } from "../myDataTypes";
import Loading from "./Loading";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import InactiveUsers from "../components/InactiveUsers";

type AdminTab = "requests" | "users" | "roles" | "inactive";
const TABS: AdminTab[] = ["requests", "users", "roles", "inactive"];

type UserRow = { uid: string; name: string; email: string; photoURL: string; points: number; taskCompleted: number; roleCount: number };

const REQUEST_LABELS: Record<StemRequest["type"], string> = {
    instructor: "Instructor access",
    createRole: "New role",
    resetRole: "Role reset",
};

export function AccessBadge({ level }: { level: AccessLevel }) {
    const colors: Record<AccessLevel, string> = {
        user: "bg-gray-100 text-gray-600",
        instructor: "bg-purple-100 text-purple-700",
        admin: "bg-blue-100 text-blue-700",
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${colors[level]}`}>{ACCESS_LABELS[level]}</span>;
}

export default function AdminPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tabParam = params.get("tab") as AdminTab | null;
    const tab: AdminTab = tabParam && TABS.includes(tabParam) ? tabParam : "requests";
    const tabBar = useSlidingIndicator(tab);

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = useMemo(() => context?.admins ?? [], [context?.admins]);
    const instructors = context?.instructors ?? [];
    const isAdmin = !!user && admins.includes(user.uid);

    const [requests, setRequests] = useState<StemRequest[]>([]);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [submittedPerRole, setSubmittedPerRole] = useState<Record<string, number>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) navigate("/", { replace: true });
    }, [loading, user, isAdmin, navigate]);

    useEffect(() => {
        if (!isAdmin) return;
        const unsubs = [
            onSnapshot(collection(db, "requests"), snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest));
                list.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
                setRequests(list);
            }, err => console.error("Error loading requests:", err)),
            // Active users: everyone still on the global leaderboard (the rest are under Inactive Users)
            onSnapshot(collection(db, "users"), snap => {
                setUsers(snap.docs
                    .filter(d => (Array.isArray(d.data().roles) ? d.data().roles as UserRoleData[] : []).some(r => r.id === GLOBAL_ROLE_ID))
                    .map(d => {
                        const data = d.data();
                        const roles: UserRoleData[] = Array.isArray(data.roles) ? data.roles : [];
                        return {
                            uid: d.id,
                            name: data.name ?? "Unknown User",
                            email: data.email ?? "",
                            photoURL: data.photoURL ?? "",
                            points: data.points ?? 0,
                            taskCompleted: data.taskCompleted ?? 0,
                            roleCount: roles.filter(r => r.id !== GLOBAL_ROLE_ID).length,
                        };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name)));
            }, err => console.error("Error loading users:", err)),
            onSnapshot(collection(db, "roles"), snap => {
                setRoles(snap.docs
                    .filter(d => d.id !== GLOBAL_ROLE_ID)
                    .map(d => ({ id: d.id, ...(d.data() as Omit<Role, "id">) }))
                    .sort((a, b) => a.name.localeCompare(b.name)));
            }, err => console.error("Error loading roles:", err)),
            onSnapshot(query(collection(db, "tasksSubmitted"), where("complete", "==", false)), snap => {
                const counts: Record<string, number> = {};
                snap.docs.forEach(d => {
                    const roleId = d.data().roleId as string;
                    counts[roleId] = (counts[roleId] || 0) + 1;
                });
                setSubmittedPerRole(counts);
            }),
        ];
        return () => unsubs.forEach(u => u());
    }, [isAdmin]);

    if (loading || !user || !isAdmin) return <Loading />;

    const accessOf = (uid: string): AccessLevel => admins.includes(uid) ? "admin" : instructors.includes(uid) ? "instructor" : "user";
    const userName = (uid: string) => users.find(u => u.uid === uid)?.name;

    const run = async (key: string, action: () => Promise<unknown>, failMessage: string) => {
        setBusy(key);
        try {
            await action();
        } catch (err) {
            console.error(err);
            await alertDialog(failMessage, "Something went wrong");
        } finally {
            setBusy(null);
        }
    };

    const approve = async (req: StemRequest) => {
        if (req.type === "resetRole") {
            const ok = await confirmDialog(
                `Reset "${req.roleName}"? Its leaderboard is saved as "${req.saveName}", then all tasks, prizes and members' points in it are cleared.`,
                { title: "Approve Reset", confirmLabel: "Reset", danger: true }
            );
            if (!ok) return;
        }
        await run(req.id, () => roleService.approveRequest(req), "Couldn't approve the request. Please try again.");
    };

    const tabs: { key: AdminTab; label: string; badge: number }[] = [
        { key: "requests", label: "Requests", badge: requests.length },
        { key: "users", label: "Users", badge: 0 },
        { key: "roles", label: "Roles", badge: 0 },
        { key: "inactive", label: "Inactive Users", badge: 0 },
    ];

    const q = search.trim().toLowerCase();
    const shownUsers = q ? users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;

    return (
        <motion.div
            className="w-full max-w-3xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Admin</h1>
                <p className="text-sm text-gray-500 mt-0.5">Review requests, manage users and their access, and run any role.</p>
            </div>

            <div ref={tabBar.ref} className="relative flex items-center gap-0.5 sm:gap-1 border-b border-gray-200 overflow-x-auto scrollbar-hide w-full">
                <span aria-hidden className={`${tabBar.indicatorClass} bg-blue-600`} style={tabBar.indicatorStyle} />
                {tabs.map(t => (
                    <div key={t.key} data-active={tab === t.key ? "true" : "false"} className="relative shrink-0">
                        <button
                            onClick={() => setParams({ tab: t.key }, { replace: true })}
                            className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors hover:cursor-pointer ${
                                tab === t.key ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            {t.label}
                            {t.badge > 0 && <span className="ml-1.5 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>}
                        </button>
                    </div>
                ))}
            </div>

            {/* Requests */}
            {tab === "requests" && (
                <div className="flex flex-col gap-3">
                    {requests.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No requests right now.</p>
                    ) : requests.map(req => (
                        <motion.div
                            key={req.id}
                            className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{REQUEST_LABELS[req.type] ?? req.type}</p>
                                    <p className="font-semibold mt-0.5">
                                        {req.type === "instructor" && `${req.userName || userName(req.uid) || "Someone"} wants to be an Instructor`}
                                        {req.type === "createRole" && `${req.userName || userName(req.uid) || "An instructor"} wants to create "${req.roleName}"`}
                                        {req.type === "resetRole" && `${req.userName || userName(req.uid) || "An instructor"} wants to reset "${req.roleName}"`}
                                    </p>
                                </div>
                                <span className="text-xs text-gray-400 shrink-0">
                                    {req.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                            </div>
                            {req.type === "instructor" && req.reason && (
                                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 whitespace-pre-wrap">{req.reason}</p>
                            )}
                            {req.type === "createRole" && (
                                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
                                    <span className="font-medium">Purpose: </span>{req.purpose || "None given"}
                                </p>
                            )}
                            {req.type === "resetRole" && (
                                <p className="text-sm text-gray-600">Data will be saved as <strong>{req.saveName}</strong>.</p>
                            )}
                            <div className="flex gap-2">
                                <Button onClick={() => approve(req)} size="xsm" color="green" disabled={busy === req.id}>
                                    {busy === req.id ? "Working..." : "Approve"}
                                </Button>
                                <Button onClick={() => run(req.id, () => roleService.declineRequest(req.id), "Couldn't decline the request.")} size="xsm" color="red" disabled={busy === req.id}>
                                    Decline
                                </Button>
                                {req.type === "resetRole" && req.roleId && (
                                    <Button onClick={() => navigate(`/admin/roles/${req.roleId}`)} size="xsm" color="gray">View Role</Button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Active users */}
            {tab === "users" && (
                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                    />
                    <p className="text-xs text-gray-400">{users.length} active user{users.length === 1 ? "" : "s"}</p>
                    {shownUsers.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No users found.</p>
                    ) : shownUsers.map(row => {
                        const level = accessOf(row.uid);
                        const pending = requests.some(r => r.type === "instructor" && r.uid === row.uid);
                        return (
                            <button
                                key={row.uid}
                                type="button"
                                onClick={() => navigate(`/admin/users/${row.uid}`)}
                                className="group flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white text-left transition-all duration-200 hover:border-gray-400 hover:shadow-sm hover:cursor-pointer"
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <ProfileImg src={row.photoURL} alt={row.name} size="xxs" />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <p className="font-medium truncate">{row.name}</p>
                                            <AccessBadge level={level} />
                                        </div>
                                        <p className="text-xs text-gray-400 truncate">
                                            {row.email ? `${row.email} · ` : ""}{row.points} pts · {row.roleCount} role{row.roleCount === 1 ? "" : "s"}
                                            {pending ? " · Requested Instructor" : ""}
                                        </p>
                                    </div>
                                </div>
                                <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Roles */}
            {tab === "roles" && (
                <div className="flex flex-col gap-3">
                    {roles.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No roles yet. Create one from the Roles page.</p>
                    ) : roles.map(role => {
                        const attention = (role.pendingRequests ?? []).length + (submittedPerRole[role.id] ?? 0);
                        const roleInstructors = (role.instructors ?? []).map(uid => userName(uid)).filter(Boolean);
                        const memberCount = (role.members ?? []).filter(uid => !admins.includes(uid) && !(role.instructors ?? []).includes(uid)).length;
                        return (
                            <button
                                key={role.id}
                                onClick={() => navigate(`/admin/roles/${role.id}`)}
                                className="flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm transition-all duration-200 text-left hover:cursor-pointer"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold truncate">{role.name}</p>
                                        {attention > 0 && <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">{attention}</span>}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">
                                        {memberCount} member{memberCount === 1 ? "" : "s"}
                                        {roleInstructors.length > 0 ? ` · Instructors: ${roleInstructors.join(", ")}` : ""}
                                    </p>
                                    {role.purpose && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{role.purpose}</p>}
                                </div>
                                <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}

            {tab === "inactive" && <InactiveUsers />}
        </motion.div>
    );
}
