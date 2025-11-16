import { addDoc, arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import './styles/rolesSelectorPage.css'
import { auth, db } from '../firebase';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { motion } from 'motion/react';
import { type Role } from '../myDataTypes';
import JoinButton from '../components/RoleJoinButton';
import useAdmins from '../hooks/Admin';
import Loading from './Loading';


function RolesSelectorPage() {
    const [roleName, setRoleName] = useState("");
    const [user, setUser] = useState<User | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);
    const admins = useAdmins();

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

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });

        return () => unsub();
    }, []);

    const createRole = async () => {
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

    if (!user) return <Loading />

    return (
        <motion.div className='roles-container'
            initial={{ y: 50 }}
            animate={{ y: 0 }}
        >
            <h1>Available Roles</h1>
            <div className='available-roles'>
                {roles.length > 0 ? roles.map((role) => {
                    if (!role.name.match("global")) {
                        return (
                            <motion.div 
                                className='role-container' 
                                whileHover={{borderColor: 'rgba(24,24,24,1)', y:-5, scale: 1.01}}
                                initial={{ x: -100 }}
                                animate={{ x: 0 }}
                                key={role.id}
                            >
                                <p className='title-card'>{role.name}</p>
                                <JoinButton role={role} />
                            </motion.div>
                        )
                    }
                }) : "Nothing at the moment"}
            </div>

            {admins.includes(user?.uid) ? <form className='role-form' onSubmit={(e) => e.preventDefault()}>
                    <h1>Create a Role</h1>
                    <input 
                        id='role-name' 
                        name='role-name' 
                        type="text" 
                        placeholder='Role name' 
                        value={roleName} 
                        onChange={(e) => setRoleName(e.target.value)}
                        maxLength={32}
                    />
                    <motion.button 
                        className='create-button' 
                        onClick={createRole}
                        whileHover={{cursor: "pointer"}}
                    >Create</motion.button>
                </form> : <div></div>}
        </motion.div>
    )
}

export default RolesSelectorPage;