import { useCallback, useContext, useEffect, useState } from "react";
import { collection, collectionGroup, getDocs, type Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxArchive, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { firebaseAuthService, GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import type { UserRoleData } from "../myDataTypes";

type InactiveRow =
    | { source: "live"; uid: string; name: string; photoURL: string; points: number; taskCompleted: number }
    | { source: "archived"; uid: string; name: string; photoURL: string; points: number; taskCompleted: number; batchId: string; batchName: string };

interface ArchiveBatch {
    id: string;
    name: string;
    createdAt?: Timestamp;
    memberCount: number;
}

/**
 * Admin page's Inactive Users tab (formerly the Alumni and Old Users pages):
 * users taken off the global leaderboard, and users archived by a semester
 * reset, each with Restore; plus the archived semester rosters.
 */
export default function InactiveUsers() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const admins = context?.admins;

    const [rows, setRows] = useState<InactiveRow[]>([]);
    const [batches, setBatches] = useState<ArchiveBatch[]>([]);
    const [loadingRows, setLoadingRows] = useState(true);
    const [restoringUid, setRestoringUid] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadingRows(true);
        try {
            const [usersSnap, batchesSnap, membersSnap] = await Promise.all([
                getDocs(collection(db, "users")),
                getDocs(collection(db, "alumni")),
                getDocs(collectionGroup(db, "members")),
            ]);

            const batchList = batchesSnap.docs.map(d => ({
                id: d.id,
                name: (d.data().name as string) ?? "Untitled Archive",
                createdAt: d.data().createdAt as Timestamp | undefined,
                memberCount: (d.data().memberCount as number) ?? 0,
            }));
            batchList.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
            setBatches(batchList);
            const batchNames = new Map(batchList.map(b => [b.id, b.name]));

            const liveRows: InactiveRow[] = usersSnap.docs
                .filter(d => {
                    const roles: UserRoleData[] = Array.isArray(d.data().roles) ? d.data().roles : [];
                    return !roles.some(r => r.id === GLOBAL_ROLE_ID) && !(admins ?? []).includes(d.id);
                })
                .map(d => ({
                    source: "live",
                    uid: d.id,
                    name: d.data().name ?? "Unknown User",
                    photoURL: d.data().photoURL ?? "",
                    points: d.data().points ?? 0,
                    taskCompleted: d.data().taskCompleted ?? 0,
                }));

            const archivedRows: InactiveRow[] = membersSnap.docs
                .filter(d => d.ref.parent.parent?.parent.id === "alumni")
                .map(d => {
                    const batchId = d.ref.parent.parent!.id;
                    return {
                        source: "archived",
                        uid: d.id,
                        name: d.data().name ?? "Unknown User",
                        photoURL: d.data().photoURL ?? "",
                        points: d.data().points ?? 0,
                        taskCompleted: d.data().taskCompleted ?? 0,
                        batchId,
                        batchName: batchNames.get(batchId) ?? "Untitled Archive",
                    };
                });

            setRows([...liveRows, ...archivedRows].sort((a, b) => a.name.localeCompare(b.name)));
        } catch (err) {
            console.error("Error loading inactive users:", err);
        } finally {
            setLoadingRows(false);
        }
    }, [admins]);

    useEffect(() => {
        load();
    }, [load]);

    const restore = async (row: InactiveRow) => {
        setRestoringUid(row.uid);
        try {
            if (row.source === "live") {
                await firebaseAuthService.restoreLiveUserToGlobal(row.uid);
            } else {
                await firebaseAuthService.restoreAlumniMemberToGlobal(row.batchId, row.uid);
            }
            await load();
        } catch (err) {
            console.error("Error restoring user:", err);
        } finally {
            setRestoringUid(null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500">
                    Users who aren't on the global leaderboard: removed one at a time, or archived by a semester reset. Restore puts them back on it.
                </p>
                {loadingRows ? (
                    <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
                ) : rows.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No inactive users.</p>
                ) : rows.map(row => (
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
                                    {row.source === "archived" ? ` · Archived: ${row.batchName}` : " · Removed from Global"}
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

            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Archived semesters</h2>
                {batches.length === 0 ? (
                    <p className="text-gray-400 text-sm">No archives yet. Archives are created from the Semester Reset tool in Settings.</p>
                ) : batches.map(batch => (
                    <button
                        key={batch.id}
                        onClick={() => navigate(`/admin/inactive/${batch.id}`)}
                        className="flex items-center justify-between px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm transition-all duration-200 text-left hover:cursor-pointer"
                    >
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                <FontAwesomeIcon icon={faBoxArchive} />
                            </div>
                            <div>
                                <p className="font-semibold">{batch.name}</p>
                                <p className="text-xs text-gray-400">
                                    {batch.createdAt ? batch.createdAt.toDate().toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ""}
                                    {" · "}{batch.memberCount} user{batch.memberCount === 1 ? "" : "s"}
                                </p>
                            </div>
                        </div>
                        <FontAwesomeIcon icon={faChevronRight} className="text-gray-300" />
                    </button>
                ))}
            </div>
        </div>
    );
}
