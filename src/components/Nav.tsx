import { useContext } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";

export default function Nav() {
    const context = useContext(MainContext);
    const navigate = useNavigate?.();

    if (!context) return null;
    const {user, userData} = context;

    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
        window.location.reload();
    };

    if (!user || !userData) return null;
    return (
        <nav className="sticky top-0 z-20 w-full bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">StemUP</h2>
                <div className="flex items-center gap-4 sm:gap-6">
                    <span className="hidden sm:block text-sm text-gray-400">{userData?.name}</span>
                    <LinkButton onClick={() => navigate("roles")}>
                        <span className="text-sm">Roles</span>
                    </LinkButton>
                    <LinkButton onClick={() => navigate("/")}>
                        <span className="hidden sm:inline text-sm">Home</span>
                        <FontAwesomeIcon icon={faHomeAlt} className="sm:hidden" />
                    </LinkButton>
                    <LinkButton onClick={() => navigate("/settings")}>
                        <span className="hidden sm:inline text-sm">Settings</span>
                        <FontAwesomeIcon icon={faGears} className="sm:hidden" />
                    </LinkButton>
                    <LinkButton onClick={handleLogout}>
                        <span className="hidden sm:inline text-sm">Logout</span>
                        <FontAwesomeIcon icon={faPowerOff} className="sm:hidden" />
                    </LinkButton>
                </div>
            </div>
        </nav>
    );
}