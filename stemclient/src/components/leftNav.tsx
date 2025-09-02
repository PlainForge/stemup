import { useEffect, useState, type ComponentState } from "react";
import "../styles/leftNav.css"
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import type { UserData } from "../myDataTypes";
import '../styles/global.css'

interface NavProps {
    toPage: ComponentState,
}

function LeftNav({ toPage } :NavProps) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);
    
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

      

    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
        window.removeEventListener('resize', handleResize);
        };
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        toPage("home")
    };

    return (
        <div className={user ? 'left-nav-user' : 'left-nav-login'} id="nav">
            <h1 className='main-title'>StemUP</h1>
            { user ? <h3>{userData?.name}</h3> : "" }
            {!user ? <p style={{color: "white"}}>2025</p> : ""}
            { user ? 
                <div className="roles-container">
                    <a onClick={() => toPage("roles")}>Roles</a>
                </div> : "" 
            }
            
            {user ? 
                <div className="user-info-container">
                    <a onClick={() => toPage("home")}><FontAwesomeIcon icon={faHomeAlt}/>{windowWidth > 768 || windowHeight > 768 ? "Home" : ""}</a>
                    <a onClick={() => toPage("settings")}><FontAwesomeIcon icon={faGears}/>{windowWidth > 768 || windowHeight > 768 ? "Settings" : ""}</a>
                    <a onClick={handleLogout}><FontAwesomeIcon icon={faPowerOff}/>{windowWidth > 768 || windowHeight > 768 ? "Logout" : ""}</a>
                </div> : 
            <div></div>}
        </div>
    )
}

export default LeftNav;