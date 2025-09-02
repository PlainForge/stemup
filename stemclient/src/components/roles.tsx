import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import '../styles/roles.css'
import '../styles/global.css'
import { auth, db } from '../firebase';
import { useEffect, useState, type ComponentState } from 'react';
import { admins } from '../admins.json'
import { onAuthStateChanged, type User } from 'firebase/auth';
import { motion } from 'motion/react';
import { type Role } from '../myDataTypes';
import JoinButton from './joinButton';

interface JoinProps {
    toPage: ComponentState,
    setRole: ComponentState
}

function Roles({ toPage, setRole } : JoinProps) {
    const [roleName, setRoleName] = useState("");
    const [user, setUser] = useState<User | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);

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
            },
            (err) => {
            console.error("Error fetching roles:", err);
            }
        );

        // cleanup listener on unmount
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
                members: [],
                pendingRequests: [],
                createdAt: new Date()
            })

            admins.map(async (admin) => {
                const userRef = doc(db, "users", admin);
                const snap = await getDoc(userRef);

                if (snap.exists()) {
                    await updateDoc(doc(db, "roles", docRef.id), {
                        members: arrayUnion({id: admin, name: snap.data().name, points: 0, taskCompleted: 0})
                    })
                }
            })

            admins.map(async (admin) => {
                await updateDoc(doc(db, "users", admin), {
                    roles: arrayUnion({id: docRef.id, name: roleName})
                })
            })

            console.log("Role created with the ID: ", docRef.id)
            setRoleName("")
        } catch (err) {
            console.log(err)
        }
    }

    if (!user) {
        return <h1>Loading...</h1>
    }

    return (
        <motion.div className='roles-container'
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
        >
            <h1>Available Roles</h1>
            <div className='available-roles'>
                {roles.map((role) => {
                    if (!role.name.match("global")) {
                        return (
                            <motion.div 
                                className='role-container' 
                                whileHover={{borderColor: 'rgba(24,24,24,1)'}}
                                initial={{ x: -100 }}
                                animate={{ x: 0 }}
                                key={role.id}
                            >
                                <p>{role.name}</p>
                                <JoinButton role={role} toPage={toPage} setRole={setRole} />
                            </motion.div>
                        )
                    }
                })}
            </div>

            {admins.includes(user?.uid) ? <form className='role-form' onSubmit={(e) => e.preventDefault()}>
                    <h1>Create a Role</h1>
                    <label htmlFor="role-name">Role Name</label>
                    <input id='role-name' name='role-name' type="text" placeholder='Name' onChange={(e) => setRoleName(e.target.value)}/>
                    <button className='create-button' onClick={createRole}>Create</button>
                </form> : <div></div>}
        </motion.div>
    )
}

export default Roles;