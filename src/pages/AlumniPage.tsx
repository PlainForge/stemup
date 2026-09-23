import { useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { useNavigate } from "react-router-dom";
import Loading from "./Loading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserGraduate } from "@fortawesome/free-solid-svg-icons";

interface AlumniBatch {
    id: string;
    name: string;
    createdAt?: Timestamp;
    roleNames: string[];
    memberCount: number;
}

export default function AlumniPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];

    const [batches, setBatches] = useState<AlumniBatch[]>([]);
    const [batchesLoading, setBatchesLoading] = useState(true);

    const isAdmin = user ? admins.includes(user.uid) : false;

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) {
            navigate("/", { replace: true });
        }
    }, [loading, user, isAdmin, navigate]);

    useEffect(() => {
        if (!user || !isAdmin) return;
        const unsub = onSnapshot(collection(db, "alumni"), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AlumniBatch, "id">) }));
            list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
            setBatches(list);
            setBatchesLoading(false);
        }, (err) => {
            console.error("Error loading alumni batches:", err);
            setBatchesLoading(false);
        });
        return () => unsub();
    }, [user, isAdmin]);

    if (loading || !user || !isAdmin) return <Loading />;

    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Alumni</h1>
                <p className="text-sm text-gray-500 mt-0.5">Archived rosters from previous semesters.</p>
            </div>

            {batchesLoading ? (
                <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
            ) : batches.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                    No archives yet. Archives are created from the Semester Reset tool in Settings.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {batches.map(batch => (
                        <motion.button
                            key={batch.id}
                            onClick={() => navigate(`/alumni/${batch.id}`)}
                            className="flex items-center justify-between px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm transition-all duration-200 text-left hover:cursor-pointer"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                    <FontAwesomeIcon icon={faUserGraduate} />
                                </div>
                                <div>
                                    <p className="font-semibold">{batch.name}</p>
                                    <p className="text-xs text-gray-400">
                                        {batch.createdAt ? batch.createdAt.toDate().toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ""}
                                        {" · "}{batch.memberCount} member{batch.memberCount === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
