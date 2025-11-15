import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import "./styles/dash.css"
import type { UserData } from "../myDataTypes";
import { motion } from "motion/react";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

export default function Dash() {
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

    if (!user || !userData) {
        return "";
    }

    return (
        <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="dash-card"
        >
            <h1 className="title-main">Your Stats</h1>
            <div className="stats-div">
                {userData?.photoURL ? (
                    <img src={userData.photoURL || DEFAULT_AVATAR} alt="Profile" className={"pfp-image"} />
                ) : (
                    <div style={{ background: "#fff" }} className="pfp-image" />
                )}
                <h3 className="title-card">{userData?.name ? userData.name : ""}</h3>
            </div>
            
            
            <motion.div className="points-div">
                <h3 className="title-card">Total Points</h3>
                <p>{userData?.points ? userData.points : 0}</p>
            </motion.div>
            <motion.div className="completed-div">
                <h3 className="title-card">Task Completed</h3>
                <p>{userData?.taskCompleted ? userData.taskCompleted : 0}</p>
            </motion.div>
        </motion.div>
    )
}