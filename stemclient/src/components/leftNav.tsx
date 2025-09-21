import { useEffect, useState, type ComponentState } from "react";
import "../styles/leftNav.css"
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff, faRefresh } from "@fortawesome/free-solid-svg-icons";
import '../styles/global.css'
import useUser from "../hooks/user";

interface NavProps {
    toPage: ComponentState,
    setRole: ComponentState,
    page: string
}

function LeftNav({ toPage, setRole, page } : NavProps) {
    const [user, userData, loading] = useUser();
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);

    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        window.location.reload();
    };

    if (loading) {
        return <h1>Loading...</h1>
    }

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
                    <a onClick={() => {
                        setRole(null);
                        if (page.match("rolepage")) {
                            toPage("roles")
                        } else toPage(page)
                    }}><FontAwesomeIcon icon={faRefresh}/>{windowWidth > 768 || windowHeight > 768 ? "Refresh" : ""}</a>
                    <a onClick={() => toPage("home")}><FontAwesomeIcon icon={faHomeAlt}/>{windowWidth > 768 || windowHeight > 768 ? "Home" : ""}</a>
                    <a onClick={() => toPage("settings")}><FontAwesomeIcon icon={faGears}/>{windowWidth > 768 || windowHeight > 768 ? "Settings" : ""}</a>
                    <a onClick={handleLogout}><FontAwesomeIcon icon={faPowerOff}/>{windowWidth > 768 || windowHeight > 768 ? "Logout" : ""}</a>
                </div> : 
            <div></div>}
        </div>
    )
}

export default LeftNav;