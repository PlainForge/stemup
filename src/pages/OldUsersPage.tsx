import { useCallback, useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { firebaseAuthService, GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { MainContext } from "../context/MainContext";
import { useNavigate } from "react-router-dom";
import Loading from "./Loading";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import type { UserRoleData } from "../myDataTypes";

type OldUserRow =
    | { source: "live"; uid: string; name: string; photoURL: string; points: number; taskCompleted: number }
    | { source: "alumni"; uid: string; name: string; photoURL: string; points: number; taskCompleted: number; batchId: string; batchName: string };

export default function OldUsersPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const isAdmin = user ? admins.includes(user.uid) : false;

    const [rows, setRows] = useState<OldUserRow[]>([]);
    const [rowsLoading, setRowsLoading] = useState(true);
    const [restoringUid, setRestoringUid] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) {
            navigate("/", { replace: true });
        }
    }, [loading, user, isAdmin, navigate]);

    const load = useCallback(async () => {
        setRowsLoading(true);
        try {
            const [usersSnap, batchesSnap, membersSnap] = await Promise.all([
                getDocs(collection(db, "users")),
                getDocs(collection(db, "alumni")),
                getDocs(collectionGroup(db, "members")),
            ]);

            const batchNames = new Map(batchesSnap.docs.map(d => [d.id, (d.data().name as string) ?? "Untitled Archive"]));

            const liveRows: OldUserRow[] = usersSnap.docs
                .filter(d => {
                    const roles: UserRoleData[] = Array.isArray(d.data().roles) ? d.data().roles : [];
                    return !roles.some(r => r.id === GLOBAL_ROLE_ID);
                })
                .filter(d => !admins.includes(d.id))
                .map(d => {
                    const data = d.data();
                    return {
                        source: "live",
                        uid: d.id,
                        name: data.name ?? "Unknown User",
                        photoURL: data.photoURL ?? "",
                        points: data.points ?? 0,
                        taskCompleted: data.taskCompleted ?? 0,
                    };
                });

            const alumniRows: OldUserRow[] = membersSnap.docs
                .filter(d => d.ref.parent.parent)
                .map(d => {
                    const data = d.data();
                    const batchId = d.ref.parent.parent!.id;
                    return {
                        source: "alumni",
                        uid: d.id,
                        name: data.name ?? "Unknown User",
                        photoURL: data.photoURL ?? "",
                        points: data.points ?? 0,
                        taskCompleted: data.taskCompleted ?? 0,
                        batchId,
                        batchName: batchNames.get(batchId) ?? "Untitled Archive",
                    };
                });

            const merged = [...liveRows, ...alumniRows].sort((a, b) => a.name.localeCompare(b.name));
            setRows(merged);
        } catch (err) {
            console.error("Error loading old users:", err);
        } finally {
            setRowsLoading(false);
        }
    }, [admins]);

    useEffect(() => {
        if (!user || !isAdmin) return;
        load();
    }, [user, isAdmin, load]);

    const restore = async (row: OldUserRow) => {
        setRestoringUid(row.uid);
        try {
            if (row.source === "live") {
                await firebaseAuthService.restoreLiveUserToGlobal(row.uid);
            } else {
                await firebaseAuthService.restoreAlumniMemberToGlobal(row.batchId, row.uid);
            }
            await load();
        } catch (err) {
            console.error("Error restoring user to global:", err);
        } finally {
            setRestoringUid(null);
        }
    };

    if (loading || !user || !isAdmin) return <Loading />;

    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Old Users</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    Users not currently in the global leaderboard — removed individually or archived from a semester reset.
                </p>
            </div>

            {rowsLoading ? (
                <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
            ) : rows.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No old users.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map(row => (
                        <div
                            key={`${row.source}-${row.uid}`}
                            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white"
                        >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <ProfileImg src={row.photoURL} alt={row.name} size="xxs" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{row.name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {row.points} pts · {row.taskCompleted} tasks
                                        {row.source === "alumni" ? ` · Alumni: ${row.batchName}` : " · Removed from Global"}
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={() => restore(row)}
                                color="gray"
                                size="xsm"
                                type="button"
                                extraClasses="shrink-0"
                                disabled={restoringUid === row.uid}
                            >
                                {restoringUid === row.uid ? "Restoring..." : "Restore"}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
