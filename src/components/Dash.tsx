import { useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { MainContext } from "../context/MainContext";
import ProfileButton from "./ProfileButton";
import ProfileImg from "./ProfileImg";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { UserData } from "../myDataTypes";

export default function Dash() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const admins = context?.admins ?? [];

    const [globalLeaders, setGlobalLeaders] = useState<UserData[]>([]);
    const [showGlobal, setShowGlobal] = useState(false);

    const GLOBAL_ROLE_ID = "r3wUbRSCX7cxwBYhtAdg";

    // Load the global leaderboard members
    useEffect(() => {
        let userUnsubs: (() => void)[] = [];

        const roleUnsub = onSnapshot(doc(db, "roles", GLOBAL_ROLE_ID), (snap) => {
            userUnsubs.forEach(u => u());
            userUnsubs = [];

            const members: string[] = snap.exists() ? (snap.data().members || []) : [];

            setGlobalLeaders(prev => prev.filter(u => members.includes(u.uid)));

            if (members.length === 0) {
                setGlobalLeaders([]);
                return;
            }

            members.forEach(uid => {
                const unsub = onSnapshot(doc(db, "users", uid), (userSnap) => {
                    if (!userSnap.exists()) return;
                    const data = userSnap.data();
                    setGlobalLeaders(prev => {
                        const others = prev.filter(u => u.uid !== uid);
                        return [...others, { uid, id: uid, ...data } as UserData];
                    });
                });
                userUnsubs.push(unsub);
            });
        });

        return () => {
            roleUnsub();
            userUnsubs.forEach(u => u());
        };
    }, []);

    // Check if current user is in a role with global leaderboard enabled
    useEffect(() => {
        if (!user) return;

        const q = query(collection(db, "roles"), where("showInGlobalLeaderboard", "==", true));
        const unsub = onSnapshot(q, (snap) => {
            const memberUids = new Set<string>();
            snap.docs.forEach(d => {
                (d.data().members as string[] || []).forEach(uid => memberUids.add(uid));
            });
            setShowGlobal(memberUids.has(user.uid));
        });

        return () => unsub();
    }, [user]);

    if (!context || !user || !userData) return null;

    const sorted =[...globalLeaders]
        .filter(u => !admins.includes(u.uid))
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

    return (
        <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col w-full max-w-lg items-center gap-8"
        >
            {/* Profile header */}
            <div className="flex flex-col items-center gap-3">
                <ProfileImg src={userData.photoURL} alt={userData.name} />
                <h2 className="text-2xl font-bold">{userData.name}</h2>
            </div>

            {/* Stat cards */}
            {!admins.includes(user.uid) && (
                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-1">
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Total Points</p>
                        <p className="text-4xl font-bold">{userData?.points ?? 0}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-1">
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Tasks Done</p>
                        <p className="text-4xl font-bold">{userData?.taskCompleted ?? 0}</p>
                    </div>
                </div>
            )}
            {/* Global Leaderboard */}
            {(showGlobal || admins.includes(user.uid)) && (
                <div className="w-full flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">Global Leaderboard</h2>
                    {sorted.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-6">No participants yet.</p>
                    ) : (
                        <>
                            {/* Podium for top 3 */}
                            {(() => {
                                const top = sorted.slice(0, 3);
                                if (top.length === 0) return null;
                                const podiumOrder = [top[1], top[0], top[2]];
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
                                            const isMe = u.uid === user.uid;
                                            return (
                                                <motion.div
                                                    key={u.uid}
                                                    className={`flex-1 flex flex-col items-center gap-1 ${cfg.mt}`}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                >
                                                    <span className="text-lg">{cfg.medal}</span>
                                                    <motion.div
                                                        className="flex flex-col items-center gap-1 cursor-pointer"
                                                        whileHover={{ scale: 1.05 }}
                                                        onClick={() => context.setShowAccount(u)}
                                                    >
                                                        <ProfileImg src={u.photoURL} alt={u.name} size={cfg.avatarSize} />
                                                        <p className={`font-semibold text-center truncate w-full ${cfg.textSize}`}>{u.name}</p>
                                                    </motion.div>
                                                    <p className={`text-gray-500 ${cfg.textSize} pointer-events-none`}><strong className="text-black">{u.points ?? 0}</strong> pts</p>
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

                            {/* 4th+ */}
                            {sorted.slice(3).map((u, idx) => (
                                <motion.div
                                    key={u.uid}
                                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                                        u.uid === user.uid
                                            ? "bg-blue-50 border-blue-200"
                                            : "bg-white border-gray-100 hover:border-gray-300"
                                    }`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 text-center text-sm font-bold text-gray-400">{idx + 4}</span>
                                        <ProfileButton user={u} size="xxs" />
                                    </div>
                                    <div className="flex gap-4 text-sm text-gray-600">
                                        <span><strong className="text-black">{u.points ?? 0}</strong> pts</span>
                                        <span className="hidden sm:inline"><strong className="text-black">{u.taskCompleted ?? 0}</strong> tasks</span>
                                    </div>
                                </motion.div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </motion.div>
    )
}