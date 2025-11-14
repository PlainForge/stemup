import { useEffect, useState } from "react";
import "./styles/nav.css"
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import useUser from "../hooks/UserHook";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";

export default function Nav() {
    const [user, userData, ] = useUser();
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);
    const location = useLocation();
    const isLogin = location.pathname === '/login';
    const navigate = useNavigate?.();

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

    const handleSwitch = () => {
        navigate(isLogin ? "/register" : "/login");
    };

    if (user != null) {
        return (
            <div className='nav-user'>
                <h1 className='main-title'>StemUP</h1>
                <h3 className="user-name">{userData?.name}</h3>
                <div className="roles-container">
                    <Link to={"/roles"} className="link-button">Roles</Link>
                </div>
                <div className="user-info-container">
                    <Link to={"/"} className="link-button">
                        {windowWidth > 900 || windowHeight > 1200 ? "Home" : <FontAwesomeIcon icon={faHomeAlt}/>}
                    </Link>
                    <Link to={"/settings"} className="link-button">
                        {windowWidth > 900 || windowHeight > 1200 ? "Settings" : <FontAwesomeIcon icon={faGears}/>}
                    </Link>
                    <a onClick={handleLogout}>
                        {windowWidth > 900 || windowHeight > 1200 ? "Logout" : <FontAwesomeIcon icon={faPowerOff}/>}
                    </a>
                </div>
            </div>
        )
    } else {
        return (
            <div className="nav-login">
                <h2 className="main-title">StemUp</h2>
                <div className="nav-right-side">
                    <motion.a
                        onClick={handleSwitch}
                        onTap={handleSwitch}
                        className="button" 
                        whileHover={{ cursor: 'pointer' }}
                    >
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        {isLogin ? <span>Sign Up</span> : <span>Sign In</span>}
                    </motion.a>
                </div>
            </div>
        );
    }
}