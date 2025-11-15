import { useEffect, useRef, useState, type FormEvent } from "react";
import "./styles/settingsPage.css"
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { db, storage } from "../firebase";
import { motion } from "motion/react";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import useUser from "../hooks/UserHook";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

function Settings() {
    const [user, userData, loading] = useUser();
    const [name, setName] = useState("")
    const [file, setFile] = useState<File | null>(null);
    const [currentRoleName, setCurrentRoleName] = useState("None")
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!user || !userData) return;

        setName(userData.name)
        userData.roles.map((role) => {
            if (role.id === userData.currentRole) return setCurrentRoleName(role.name)
        })
    }, [user, userData])

    if (!user || !userData || loading) {
        return <h1>Loading...</h1>;
    }

    const handleDeleteAccount = async () => {
        const confirmDelete = window.confirm("Are you sure you want to delete your account? This cannot be undone.");

        if (!confirmDelete) return;

        try {
            const batchUpdates: Promise<void>[] = [];

            // Remove user from all roles
            const rolesSnap = await getDocs(collection(db, "roles"));
            rolesSnap.forEach((roleDoc) => {
                const data = roleDoc.data();
                const members: string[] = data.members || [];

                if (members.includes(user.uid)) {
                    const updatedMembers = members.filter((m) => m !== user.uid);
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

            if (userData?.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                try {
                    const oldRef = ref(storage, `profilePictures/${user.uid}`);
                    await deleteObject(oldRef);
                } catch (err) {
                    console.warn("No profile picture to delete or already removed:", err);
                }
            }

            await deleteDoc(doc(db, "users", user.uid));

            await Promise.all(batchUpdates);

            await deleteUser(user);

            console.log("User account and related data deleted.");
        } catch (err) {
            console.error("Error deleting account:", err);
        }
    };

    const changeAccount = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // Keep the same photo unless a new one is uploaded
        let photoURL = userData.photoURL;

        try {
            // 1. If a new file was selected, replace the old file
            if (file) {
                // If user had a custom pic, delete it
                if (userData.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                    try {
                        const oldRef = ref(storage, `profilePictures/${user.uid}`);
                        await deleteObject(oldRef);
                    } catch (err) {
                        console.warn("Couldn't delete old picture:", err);
                    }
                }

                // Upload the new file
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(storageRef);
            }

            // 2. Update Firestore (only changing name + photoURL if needed)
            await setDoc(
                doc(db, "users", user.uid),
                {
                    name: name,
                    photoURL: photoURL,
                },
                { merge: true }
            );

            // Reset file input
            setFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (err) {
            console.log(err);
        }
    };

    const cancelCurrent = () => {
        if (!userData) return;

        setName(userData.name);
        setFile(null)
    }

    const handleCurrentRole = async () => {
        const userRef = doc(db, "users", user.uid)
        await updateDoc(userRef, {
            currentRole: ""
        })
    }

    return (
        <motion.div className="main-settings-container"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
        >
            <div className="title-container">
                <h1 className="title-main">Account Settings</h1>
                <p className="sub-title"><strong>Account ID</strong>: {user.uid}</p>
            </div>
            <div className="settings-container">
                <div className="settings-current">
                    <div className="settings-account">
                        <form className="settings-form" onSubmit={changeAccount}>
                            <div className="settings-user">
                                <div className="current-account-1">
                                    <h3>Your Name</h3>
                                    <input 
                                        type="name" 
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="input-lg"
                                        maxLength={16}
                                        required
                                    />
                                </div>
                                <div className="current-account-2">
                                    {userData?.photoURL ? (
                                        <img src={userData.photoURL} alt="Profile" className={"pfp-image"} />
                                    ) : (
                                        <div style={{ background: "#fff" }} className="pfp-image" />
                                    )}
                                    <label className="button-sm">
                                        Upload a new Photo
                                        <input 
                                            ref={fileInputRef}
                                            itemID="newPfp"
                                            name="newPfp"
                                            type="file" 
                                            accept="image/*" 
                                            onChange={(e) => setFile(e.target.files?.[0] || null)} 
                                            className="hidden-button"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="form-options">
                                <button className="button-sm button-error" onClick={cancelCurrent}>Cancel</button>
                                <button type="submit" className="button-sm">Save</button>
                            </div>
                        </form>
                        <div className="other-options">
                            <div className="current-role">
                                <button onClick={handleCurrentRole} className="button-sm button-error">Reset current role</button>
                                <h3 className="title-card">Current Role: {currentRoleName}</h3>
                            </div>
                            <button onClick={handleDeleteAccount} className="button-sm button-error">Delete my account</button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

export default Settings;