import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import "../styles/dash.css"
import '../styles/global.css'
import type { UserData } from "../myDataTypes";
import { motion } from "motion/react";

interface dashProps {
    currentPage: string
}

function Dash({ currentPage } : dashProps) {
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
            className={currentPage.match("home") ? "dash-container-open" : 'dash-container'}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
        >
            <div className="account-container div">
                <h1>Dashboard</h1>
                <h1>{userData?.name}</h1>
                {userData?.photoURL ? (
                    <img src={userData.photoURL} alt="Profile" className={currentPage.match("home") ? "pfp-image-open" : "pfp-image"} />
                ) : (
                    <div style={{ background: "#fff" }} className="pfp-image" />
                )}
                {currentPage.match('home') ? <h1 className="username">{userData?.name ? userData.name : ""}</h1> : ''}
            </div>
            
            
            <div className="points-container div">
                <h3>Total Points</h3>
                <p>{userData?.points ? userData.points : 0}</p>
            </div>
            <div className="completed-container div">
                <h3>Task Completed</h3>
                <p>{userData?.taskCompleted ? userData.taskCompleted : 0}</p>
            </div>
        </motion.div>
    )
}

export default Dash;