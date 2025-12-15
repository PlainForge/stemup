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
    }, []);

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
        <motion.div className='w-full flex flex-col items-center py-4 gap-4'
            initial={{ y: 50 }}
            animate={{ y: 0 }}
        >
            <h1 className='text-3xl'>Available Roles</h1>
            <div className='flex flex-col gap-4 mt-4'>
                {roles.length > 0 ? roles.map((role) => {
                    if (!role.name.match("global")) {
                        return (
                            <motion.div 
                                className="
                                    w-sm md:w-md flex justify-between
                                    px-4 py-2 border border-[rgba(24,24,24,0.3)]
                                    rounded-2xl 
                                    hover:border-[rgba(24,24,24,0.9)]
                                    transition-all duration-300 ease-out
                                "
                                initial={{ x: -100, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                key={role.id}
                            >
                                <p className='font-semibold text-2xl'>{userData?.currentRole.match(role.id) ? <FontAwesomeIcon icon={faStar}/> : ""} {role.name}</p>
                                <JoinButton role={role} />
                            </motion.div>
                        )
                    }
                }) : "Nothing at the moment"}
            </div>

            {admins.includes(user?.uid) ? 
                <form className='flex flex-col gap-4 items-center' onSubmit={(e) => e.preventDefault()}>
                    <h1 className='text-2xl'>Create a Role</h1>
                    <Input 
                        size='md'
                        type="text" 
                        placeholder='Role name' 
                        value={roleName} 
                        setValue={setRoleName}
                        maxLength={32}
                        required={true}
                        autocomplete='false'
                    />
                    <Button
                        onClick={createRole}
                    >
                        Create
                    </Button>
                </form> : null}
        </motion.div>
    )
}