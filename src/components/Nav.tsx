import { useContext, useEffect, useState } from "react";
import "./styles/nav.css"
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { MainContext } from "../context/MainContext";

export default function Nav() {
    const context = useContext(MainContext);
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

    if (!context) return null;
    const {userData} = context

    const handleLogout = async () => {
        await signOut(auth);
        window.location.reload();
    };

    return (
        <div className='nav-user'>
            <h2 className='title-main'>StemUP</h2>
            <h3 className="user-name">{userData?.name}</h3>
            <div className="roles-container">
                <Link to={"/roles"} className="link-btn">Roles</Link>
            </div>
            <div className="user-info-container">
                <Link to={"/"} className="link-btn">
                    {windowWidth > 1000 || windowHeight > 1200 ? "Home" : <FontAwesomeIcon icon={faHomeAlt}/>}
                </Link>
                <Link to={"/settings"} className="link-btn">
                    {windowWidth > 1000 || windowHeight > 1200 ? "Settings" : <FontAwesomeIcon icon={faGears}/>}
                </Link>
                <a onClick={handleLogout} className="link-btn">
                    {windowWidth > 1000 || windowHeight > 1200 ? "Logout" : <FontAwesomeIcon icon={faPowerOff}/>}
                </a>
            </div>
        </div>
    )
}