import { addDoc, arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
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

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];

    useEffect(() => {
        if (!user) return;
        const rolesCol = collection(db, "roles");

        const unsub = onSnapshot(
            rolesCol,
            (rolesSnap) => {
                const rolesList: Role[] = rolesSnap.docs.map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as { name: string }),
                }));

                setRoles(rolesList);
            }, (err) => {
                console.error("Error fetching roles:", err);
            }
        );

        return () => unsub();
    }, [user]);

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
                            className={`flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-200 ${
                                isActive
                                    ? "border-blue-400 bg-blue-50"
                                    : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm"
                            }`}
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center gap-2">
                                {isActive && (
                                    <FontAwesomeIcon icon={faStar} className="text-blue-500 text-sm" />
                                )}
                                <p className="font-semibold">{role.name}</p>
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