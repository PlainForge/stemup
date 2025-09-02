import { useEffect, useState } from "react";
import "../styles/settings.css"
import '../styles/global.css'
import { deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { deleteUser, onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "../firebase";
import type { UserData } from "../myDataTypes";
import { motion } from "motion/react";

function Settings() {
    const [name, setName] = useState("")
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);

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
            await deleteDoc(doc(db, "users", user.uid));
            await deleteUser(user);

            alert("Account deleted successfully.");
        } catch (err) {
            console.error("Error deleting account:", err);
            alert("Something went wrong while deleting your account.");
        }
    };

    if (!user || !userData) {
        return <h1>Loading...</h1>;
    }

    const changeName = async () => {
        try {
            setName("")
            await setDoc(doc(db, "users",  user.uid), {
                name: name,
            }, { merge: true });
        } catch (err) {
            console.error(err);
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
                        <div className="settings-name-container">
                                <h3>Change Display Name</h3>
                                <input 
                                    type="name" 
                                    placeholder="Display Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="input"
                                    maxLength={16}
                                />
                                <button onClick={changeName}>Submit</button>
                        </div>
                        <button onClick={handleDeleteAccount} className="del-acc">Delete Account</button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

export default Settings;