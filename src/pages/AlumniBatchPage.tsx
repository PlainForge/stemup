import { useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { firebaseAuthService } from "../lib/firebaseService";
import { MainContext } from "../context/MainContext";
import { useNavigate, useParams } from "react-router-dom";
import Loading from "./Loading";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

interface AlumniMember {
    uid: string;
    name: string;
    photoURL: string;
    points: number;
    taskCompleted: number;
}

interface AlumniBatch {
    name: string;
    createdAt?: Timestamp;
    roleNames: string[];
}

export default function AlumniBatchPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { id: batchId } = useParams<{ id: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const isAdmin = user ? admins.includes(user.uid) : false;

    const [batch, setBatch] = useState<AlumniBatch | null>(null);
    const [members, setMembers] = useState<AlumniMember[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) {
            navigate("/", { replace: true });
        }
    }, [loading, user, isAdmin, navigate]);

    useEffect(() => {
        if (!user || !isAdmin || !batchId) return;

        const load = async () => {
            setDataLoading(true);
            try {
                const [batchSnap, membersSnap] = await Promise.all([
                    getDoc(doc(db, "alumni", batchId)),
                    getDocs(collection(db, "alumni", batchId, "members")),
                ]);

                if (!batchSnap.exists()) {
                    setBatch(null);
                    setMembers([]);
                    return;
                }

                setBatch(batchSnap.data() as AlumniBatch);
                const list = membersSnap.docs.map(d => d.data() as AlumniMember);
                list.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
                setMembers(list);
            } catch (err) {
                console.error("Error loading alumni batch:", err);
            } finally {
                setDataLoading(false);
            }
        };

        load();
    }, [user, isAdmin, batchId]);

    const handleDelete = async () => {
        if (!batchId) return;
        const confirmDelete = window.confirm(`Delete the "${batch?.name}" archive? This cannot be undone.`);
        if (!confirmDelete) return;

        try {
            setDeleting(true);
            await firebaseAuthService.deleteAlumniBatch(batchId);
            navigate("/alumni", { replace: true });
        } catch (err) {
            console.error("Error deleting alumni batch:", err);
        } finally {
            setDeleting(false);
        }
    };

    if (loading || !user || !isAdmin || dataLoading) return <Loading />;

    if (!batch) {
        return (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6 items-center">
                <p className="text-gray-400 text-sm text-center py-8">This archive no longer exists.</p>
                <Button onClick={() => navigate("/alumni")} color="gray" size="sm">Back to Alumni</Button>
            </div>
        );
    }

    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <button
                    onClick={() => navigate("/alumni")}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2 flex items-center gap-1.5 hover:cursor-pointer"
                >
                    <FontAwesomeIcon icon={faArrowLeft} className="text-[10px]" /> Back to Alumni
                </button>
                <h1 className="text-2xl font-bold">{batch.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {batch.createdAt ? batch.createdAt.toDate().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
                    {batch.roleNames?.length > 0 && ` · Archived from: ${batch.roleNames.join(", ")}`}
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {members.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No members in this archive.</p>
                ) : (
                    members.map((m, idx) => (
                        <div
                            key={m.uid}
                            className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-white"
                        >
                            <div className="flex items-center gap-3">
                                <span className="w-6 text-center text-sm font-bold text-gray-400">{idx + 1}</span>
                                <ProfileImg src={m.photoURL} alt={m.name} size="xxs" />
                                <p className="font-medium">{m.name}</p>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                                <span><strong className="text-black">{m.points ?? 0}</strong> pts</span>
                                <span className="hidden sm:inline"><strong className="text-black">{m.taskCompleted ?? 0}</strong> tasks</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 mt-2">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400 mb-1">Danger Zone</h2>
                <p className="text-sm text-gray-500 mb-4">Permanently deletes this archive and all of its saved data.</p>
                <Button onClick={handleDelete} color="red" size="sm" disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete This Archive"}
                </Button>
            </div>
        </motion.div>
    );
}
