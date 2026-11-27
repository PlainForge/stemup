import { useContext, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { describeRoleChange, isRoleChange, isRoleStaff, roleOwner, roleService } from "../lib/roleService";
import { alertDialog, confirmDialog } from "../lib/confirm";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import type { Role, StemRequest } from "../myDataTypes";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import Loading from "./Loading";

type InstructorTab = "roles" | "requests";
const TABS: InstructorTab[] = ["roles", "requests"];

type Person = { uid: string; name: string; photoURL: string };

/** Which role something is in, shown on every request */
function RoleChip({ role, onClick }: { role: Role | undefined; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="shrink-0 max-w-40 truncate text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:border-blue-300 transition-colors hover:cursor-pointer"
        >
            {role?.name ?? "Unknown role"}
        </button>
    );
}

/**
 * /instructor: an Instructor's own page, like the Admin page. The roles they
 * run, and every request waiting on them across those roles.
 */
export default function InstructorPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tabParam = params.get("tab") as InstructorTab | null;
    const tab: InstructorTab = tabParam && TABS.includes(tabParam) ? tabParam : "roles";
    const tabBar = useSlidingIndicator(tab);

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const access = context?.access ?? "user";
    const admins = context?.admins ?? [];
    const instructedRoles = context?.instructedRoles;
    const roles = useMemo(() => instructedRoles ?? [], [instructedRoles]);
    const uid = user?.uid;

    const [requests, setRequests] = useState<StemRequest[]>([]);
    const [submittedPerRole, setSubmittedPerRole] = useState<Record<string, number>>({});
    const [people, setPeople] = useState<Record<string, Person>>({});
    const [busy, setBusy] = useState<string | null>(null);

    // Admins have the Admin page; this one is for Instructors
    useEffect(() => {
        if (loading || !user) return;
        if (access === "admin") navigate("/admin", { replace: true });
        else if (access !== "instructor") navigate("/", { replace: true });
    }, [loading, user, access, navigate]);

    const roleIdsKey = roles.map(r => r.id).join(",");
    useEffect(() => {
        if (access !== "instructor") return;
        const unsubs = [
            onSnapshot(collection(db, "requests"), snap => {
                setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)));
            }, err => console.error("Error loading requests:", err)),
            onSnapshot(query(collection(db, "tasksSubmitted"), where("complete", "==", false)), snap => {
                const counts: Record<string, number> = {};
                snap.docs.forEach(d => {
                    const roleId = d.data().roleId as string;
                    counts[roleId] = (counts[roleId] || 0) + 1;
                });
                setSubmittedPerRole(counts);
            }, err => console.error("Error loading submissions:", err)),
        ];
        return () => unsubs.forEach(u => u());
    }, [access, roleIdsKey]);

    const roleById = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);

    // Change requests about the roles they run: ones to approve (as owner) and ones they sent
    const toReview = requests.filter(r => isRoleChange(r.type) && r.uid !== uid && roleOwner(roleById.get(r.roleId ?? "")) === uid);
    const mine = requests.filter(r => isRoleChange(r.type) && r.uid === uid && roleById.has(r.roleId ?? ""));
    const byDate = (a: StemRequest, b: StemRequest) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0);
    toReview.sort(byDate);
    mine.sort(byDate);
    const joins = roles.flatMap(role => (role.pendingRequests ?? []).map(personUid => ({ role, uid: personUid })));

    // Names and photos for everyone asking to join
    const joinUidsKey = Array.from(new Set(joins.map(j => j.uid))).sort().join(",");
    useEffect(() => {
        const uids = joinUidsKey ? joinUidsKey.split(",") : [];
        let cancelled = false;
        Promise.all(uids.map(u => getDoc(doc(db, "users", u)))).then(snaps => {
            if (cancelled) return;
            const next: Record<string, Person> = {};
            snaps.forEach(s => {
                if (s.exists()) next[s.id] = { uid: s.id, name: (s.data().name as string) ?? "Unknown User", photoURL: (s.data().photoURL as string) ?? "" };
            });
            setPeople(next);
        });
        return () => { cancelled = true; };
    }, [joinUidsKey]);

    if (loading || !user || access !== "instructor") return <Loading />;

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
        const role = roleById.get(req.roleId ?? "");
        if (req.type === "resetRole" || req.type === "kickMember") {
            const ok = await confirmDialog(
                req.type === "resetRole"
                    ? `Reset ${role?.name ?? req.roleName}? Its leaderboard is saved as "${req.saveName}", then all tasks, prizes and members' points in it are cleared.`
                    : `Remove ${req.targetName ?? "this member"} from ${role?.name ?? req.roleName}? Their tasks in this role are deleted.`,
                { title: req.type === "resetRole" ? "Approve Reset" : "Approve Kick", confirmLabel: req.type === "resetRole" ? "Reset" : "Kick", danger: true }
            );
            if (!ok) return;
        }
        await run(req.id, () => roleService.approveRequest(req), "Couldn't approve the request. Please try again.");
    };

    // Everything listed on the Requests tab, so the count matches what you see there
    const requestCount = joins.length + toReview.length + mine.length;
    const tabs: { key: InstructorTab; label: string; badge: number }[] = [
        { key: "roles", label: "Roles", badge: 0 },
        { key: "requests", label: "Requests", badge: requestCount },
    ];
    const openRole = (roleId: string, sub?: string) => navigate(`/instructor/roles/${roleId}${sub ? `?tab=${sub}` : ""}`);
    const card = "bg-white border border-gray-100 rounded-2xl px-4 py-3 flex flex-col gap-3";
    const sectionTitle = "text-sm font-semibold uppercase tracking-widest text-gray-400";

    return (
        <motion.div
            className="w-full max-w-3xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Instructor</h1>
                <p className="text-sm text-gray-500 mt-0.5">The roles you run, and everything waiting on you across them.</p>
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

            {/* Roles they run */}
            {tab === "roles" && (
                <div className="flex flex-col gap-3">
                    {roles.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">
                            You don't run any roles yet. Request a new one from the Roles page, or ask a role's owner to add you.
                        </p>
                    ) : roles.map(role => {
                        const attention = (role.pendingRequests ?? []).length + (submittedPerRole[role.id] ?? 0)
                            + toReview.filter(r => r.roleId === role.id).length;
                        const memberCount = (role.members ?? []).filter(m => !isRoleStaff(role, m, admins)).length;
                        const owns = roleOwner(role) === uid;
                        return (
                            <button
                                key={role.id}
                                onClick={() => openRole(role.id)}
                                className="group flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm transition-all duration-200 text-left hover:cursor-pointer"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold truncate">{role.name}</p>
                                        {owns && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Owner</span>}
                                        {attention > 0 && <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">{attention}</span>}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">
                                        {memberCount} member{memberCount === 1 ? "" : "s"}
                                        {(submittedPerRole[role.id] ?? 0) > 0 ? ` · ${submittedPerRole[role.id]} to review` : ""}
                                    </p>
                                    {role.purpose && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{role.purpose}</p>}
                                </div>
                                <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Every request across their roles, each with the role it's in */}
            {tab === "requests" && (
                <div className="flex flex-col gap-6">
                    {joins.length === 0 && toReview.length === 0 && mine.length === 0 && (
                        <p className="text-gray-400 text-sm text-center py-8">No requests right now.</p>
                    )}

                    {joins.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <h2 className={sectionTitle}>Join requests</h2>
                            {joins.map(({ role, uid: personUid }) => {
                                const person = people[personUid];
                                const key = `${role.id}:${personUid}`;
                                return (
                                    <motion.div key={key} className={card} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <ProfileImg src={person?.photoURL} alt={person?.name} size="xs" />
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{person?.name ?? "Loading..."}</p>
                                                    <p className="text-xs text-gray-400">wants to join</p>
                                                </div>
                                            </div>
                                            <RoleChip role={role} onClick={() => openRole(role.id, "requests")} />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="xsm" color="green" disabled={busy === key}
                                                onClick={() => run(key, () => roleService.acceptJoinRequest(role, personUid), "Couldn't accept them. Please try again.")}>
                                                Accept
                                            </Button>
                                            <Button size="xsm" color="red" disabled={busy === key}
                                                onClick={() => run(key, () => roleService.declineJoinRequest(role.id, personUid), "Couldn't decline the request.")}>
                                                Decline
                                            </Button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}

                    {toReview.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <h2 className={sectionTitle}>Instructor requests</h2>
                            <p className="text-xs text-gray-400 -mt-1">You own these roles, so their other instructors ask you first.</p>
                            {toReview.map(req => (
                                <motion.div key={req.id} className={card} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-medium">{describeRoleChange(req)}</p>
                                        <RoleChip role={roleById.get(req.roleId ?? "")} onClick={() => openRole(req.roleId ?? "", "requests")} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="xsm" color="green" disabled={busy === req.id} onClick={() => approve(req)}>
                                            {busy === req.id ? "Working..." : "Approve"}
                                        </Button>
                                        <Button size="xsm" color="red" disabled={busy === req.id}
                                            onClick={() => run(req.id, () => roleService.declineRequest(req.id), "Couldn't decline the request.")}>
                                            Decline
                                        </Button>
                                        <span className="ml-auto text-xs text-gray-400">
                                            {req.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {mine.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <h2 className={sectionTitle}>Sent by you</h2>
                            {mine.map(req => {
                                const role = roleById.get(req.roleId ?? "");
                                return (
                                    <motion.div key={req.id} className={card} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-medium">{describeRoleChange(req, true)}</p>
                                            <RoleChip role={role} onClick={() => openRole(req.roleId ?? "", "requests")} />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-amber-600 flex-1">Waiting for {roleOwner(role) ? "the role's owner" : "an admin"}</span>
                                            <Button size="xsm" color="cancel" onClick={() => roleService.deleteRequest(req.id)}>Withdraw</Button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}
