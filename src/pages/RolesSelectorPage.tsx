import { addDoc, arrayUnion, collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useContext, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { type Role } from '../myDataTypes';
import JoinButton from '../components/RoleJoinButton';
import Loading from './Loading';
import { MainContext } from '../context/MainContext';
import Input from '../components/Input';
import Button from '../components/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';


export default function RolesSelectorPage() {
    const context = useContext(MainContext);
    const [roleName, setRoleName] = useState("");
    const [roles, setRoles] = useState<Role[]>([]);
    const [requestsPerRole, setRequestsPerRole] = useState<Record<string, number>>({});
    const [submittedPerRole, setSubmittedPerRole] = useState<Record<string, number>>({});
    const [incompletePerRole, setIncompletePerRole] = useState<Record<string, number>>({});

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];

    useEffect(() => {
        if (!user) return;
        const rolesCol = collection(db, "roles");

        const unsub = onSnapshot(rolesCol, (rolesSnap) => {
            const rolesList: Role[] = rolesSnap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as { name: string }),
            }));
            setRoles(rolesList);

            if (admins.includes(user.uid)) {
                const counts: Record<string, number> = {};
                rolesSnap.docs.forEach(d => {
                    counts[d.id] = (d.data().pendingRequests || []).length;
                });
                setRequestsPerRole(counts);
            }
        }, (err) => {
            console.error("Error fetching roles:", err);
        });

        return () => unsub();
    }, [user, admins]);

    useEffect(() => {
        if (!user || admins.includes(user.uid)) return;

        const q = query(
            collection(db, "tasks"),
            where("assignedTo", "==", user.uid),
            where("complete", "==", false)
        );
        const unsub = onSnapshot(q, (snap) => {
            const counts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const roleId = d.data().roleId as string;
                if (roleId) counts[roleId] = (counts[roleId] || 0) + 1;
            });
            setIncompletePerRole(counts);
        });
        return () => unsub();
    }, [user, admins]);

    useEffect(() => {
        if (!user || !admins.includes(user.uid)) return;

        const q = query(collection(db, "tasksSubmitted"), where("complete", "==", false));
        const unsub = onSnapshot(q, (snap) => {
            const counts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const roleId = d.data().roleId as string;
                counts[roleId] = (counts[roleId] || 0) + 1;
            });
            setSubmittedPerRole(counts);
        });

        return () => unsub();
    }, [user, admins]);

    if (!user || loading) return <Loading />

    const createRole = async () => {
        if (roleName === "" || !roleName || roleName.length <= 0) return;
        try {
            const docRef = await addDoc(collection(db, "roles"), {
                name: roleName,
                members: admins,
                pendingRequests: [],
                createdAt: new Date()
            })
            await setDoc(doc(db, "rewards", docRef.id), {
                first: "not set",
                second: "not set",
                third: "not set"
            })

            admins.map(async (admin) => {
                await updateDoc(doc(db, "users", admin), {
                    roles: arrayUnion({id: docRef.id, name: roleName, points: 0, taskCompleted: 0})
                })
            })

            console.log("Role created with the ID: ", docRef.id)
            setRoleName("")
        } catch (err) {
            console.log(err)
        }
    }


    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Available Roles</h1>
                <p className="text-sm text-gray-500 mt-0.5">Select a role to join and start earning points.</p>
            </div>

            <div className="flex flex-col gap-3">
                {roles.length > 0 ? roles.map((role) => {
                    if (role.name.match("global")) return null;
                    const isActive = userData?.currentRole === role.id;
                    return (
                        <motion.div
                            key={role.id}
                            className={`relative flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-200 ${
                                isActive
                                    ? "border-blue-400 bg-blue-50"
                                    : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm"
                            }`}
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            {!admins.includes(user.uid) && userData?.roles?.some(r => r.id === role.id) && (incompletePerRole[role.id] || 0) > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1 shadow">
                                    {incompletePerRole[role.id]}
                                </span>
                            )}
                            <div className="flex items-center gap-2">
                                {isActive && (
                                    <FontAwesomeIcon icon={faStar} className="text-blue-500 text-sm" />
                                )}
                                <p className="font-semibold">{role.name}</p>
                                {admins.includes(user.uid) && ((requestsPerRole[role.id] || 0) + (submittedPerRole[role.id] || 0)) > 0 && (
                                    <span className="relative flex size-2.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                        <span className="relative inline-flex size-2.5 rounded-full bg-sky-500"></span>
                                    </span>
                                )}
                            </div>
                            <JoinButton role={role} />
                        </motion.div>
                    );
                }) : (
                    <p className="text-gray-400 text-sm text-center py-8">No roles available at the moment.</p>
                )}
            </div>

            {admins.includes(user?.uid) && (
                <div className="border-t border-gray-100 pt-6">
                    <h2 className="text-base font-semibold mb-3">Create a Role</h2>
                    <form className="flex flex-col sm:flex-row gap-3" onSubmit={(e) => e.preventDefault()}>
                        <Input
                            size="full"
                            type="text"
                            placeholder="Role name"
                            value={roleName}
                            setValue={setRoleName}
                            maxLength={32}
                            required={true}
                            autocomplete="false"
                        />
                        <Button onClick={createRole} size="sm">Create</Button>
                    </form>
                </div>
            )}
        </motion.div>
    )
}