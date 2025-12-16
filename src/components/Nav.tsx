import { useContext, useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";

export default function Nav() {
    const context = useContext(MainContext);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);
    const navigate = useNavigate?.();

    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (!context) return null;
    const {user, userData} = context

    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
    };

    if (!user || !userData) return null;
    return (
        <div className='flex w-full justify-evenly items-center'>
            <h2 className='text-2xl font-bold'>StemUP</h2>
            <h3 className="hidden md:block">{userData?.name}</h3>
            <div className="roles-container">
                <LinkButton onClick={() => navigate("roles")}>Roles</LinkButton>
            </div>
            <div className="flex space-x-4">
                <LinkButton onClick={() => navigate("/")}>
                    {windowWidth > 1000 || windowHeight > 1200 ? "Home" : <FontAwesomeIcon icon={faHomeAlt}/>}
                </LinkButton>
                <LinkButton onClick={() => navigate("/settings")}>
                    {windowWidth > 1000 || windowHeight > 1200 ? "Settings" : <FontAwesomeIcon icon={faGears}/>}
                </LinkButton>
                <LinkButton onClick={handleLogout}>
                    {windowWidth > 1000 || windowHeight > 1200 ? "Logout" : <FontAwesomeIcon icon={faPowerOff}/>}
                </LinkButton>
            </div>
        </div>
    )
}