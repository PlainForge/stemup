import { useEffect, useRef, useState, type FormEvent } from "react";
import "../styles/settings.css"
import '../styles/global.css'
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { deleteUser, onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import type { RoleUserData, UserData } from "../myDataTypes";
import { motion } from "motion/react";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import useUser from "../hooks/user";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

function Settings() {
    const [name, setName] = useState("")
    const [user, loading] = useUser();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const ref = doc(db, "users", currentUser.uid);

                const unsubscribeSnapshot = onSnapshot(ref, (snap) => {
                    if (snap.exists()) {
                        setUserData(snap.data() as UserData);
                    }
                });

                return () => unsubscribeSnapshot();
            } else {
                setUserData(null);
            }
        });
        return () => unsub();
    }, []);

    const handleDeleteAccount = async () => {
        if (!user) return;

        const confirmDelete = window.confirm("Are you sure you want to delete your account? This cannot be undone.");

        if (!confirmDelete) return;

        try {
            const rolesSnap = await getDocs(collection(db, "roles"));
            const batchUpdates: Promise<void>[] = [];

            rolesSnap.forEach((roleDoc) => {
                const data = roleDoc.data();
                const members = data.members || [];

                if (members.some((m: RoleUserData) => m.id === user.uid)) {
                    const updatedMembers = members.filter((m: RoleUserData) => m.id !== user.uid);
                    batchUpdates.push(
                        updateDoc(doc(db, "roles", roleDoc.id), { members: updatedMembers })
                    );
                }
            });

            const q = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
                const tasksSnap = await getDocs(q);
                tasksSnap.forEach((taskDoc) => {
                batchUpdates.push(deleteDoc(doc(db, "tasks", taskDoc.id)));
            });

            await Promise.all(batchUpdates);

            await deleteDoc(doc(db, "users", user.uid));
            await deleteUser(user);

            console.log("User account and related data deleted.");
        } catch (err) {
            console.error("Error deleting account:", err);
        }
    };

    if (!user || !userData || loading) {
        return <h1>Loading...</h1>;
    }

    const changeName = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
            await setDoc(doc(db, "users",  user.uid), {
                name: name,
            }, { merge: true });
            setName("")
        } catch (err) {
            console.error(err);
        }
    }

    const chanePfp = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        let photoURL = DEFAULT_AVATAR;
        
        try {
            if (userData?.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                try {
                    // Extract the storage path from the URL
                    const oldRef = ref(storage, `profilePictures/${user.uid}`);
                    await deleteObject(oldRef);
                } catch (err) {
                    console.warn("No old profile picture to delete or already removed:", err);
                }
            }
            if (file) {
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, "users", user.uid), {
                photoURL: photoURL
            }, { merge: true });

            setFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (err) {
            console.log(err);
        }
    }
    
    return (
        <motion.div className="main-settings-container"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
        >
            <h1 className="settings-title">Settings</h1>
            <div className="settings-container">
                <div className="settings-tab">
                    <button>Account</button>
                </div>
                <div className="settings-current">
                    <div className="settings-account">
                        <form className="settings-name-container" onSubmit={changeName}>
                            <h3>Change Display Name</h3>
                            <input 
                                type="name" 
                                placeholder="Display Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input"
                                maxLength={16}
                            />
                            <button type="submit">Submit</button>
                        </form>
                        <form className="settings-pfp-container" onSubmit={chanePfp}>
                            <h3>Change Profile Picture</h3>
                            <input 
                                ref={fileInputRef}
                                itemID="newPfp"
                                name="newPfp"
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => setFile(e.target.files?.[0] || null)} 
                                className="photo-button"
                            />
                            <button type="submit">Submit</button>
                        </form>
                        <button onClick={handleDeleteAccount} className="del-acc">Delete Account</button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

export default Settings;