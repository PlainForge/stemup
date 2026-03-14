import { useContext } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff, faUsers } from "@fortawesome/free-solid-svg-icons";
import { useNavigate, useLocation } from "react-router-dom";
import { MainContext } from "../context/MainContext";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

function NavItem({ icon, label, onClick, active, danger, ping }: {
    icon: IconDefinition;
    label: string;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    ping?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:cursor-pointer ${
                danger
                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                    : active
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
            }`}
        >
            <FontAwesomeIcon icon={icon} className="text-xs" />
            <span className="hidden sm:inline">{label}</span>
            {ping && (
                <span className="absolute top-0.5 right-0.5 flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
                </span>
            )}
        </button>
    );
}

export default function Nav() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const location = useLocation();

    if (!context) return null;
    const { user, userData, roleNotification } = context;

    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
        window.location.reload();
    };

    if (!user || !userData) return null;

    const path = location.pathname;

    return (
        <nav className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-0.5 px-2 py-1.5 rounded-full backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border border-gray-200/60 dark:border-white/10 shadow-lg shadow-black/5">
                {/* Logo */}
                <span className="font-bold text-sm px-3 tracking-tight select-none">StemUP</span>

                {/* Divider */}
                <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

                <NavItem icon={faHomeAlt} label="Home" onClick={() => navigate("/")} active={path === "/"} />
                <NavItem icon={faUsers} label="Roles" onClick={() => navigate("/roles")} active={path.startsWith("/roles")} ping={roleNotification} />
                <NavItem icon={faGears} label="Settings" onClick={() => navigate("/settings")} active={path === "/settings"} />

                {/* Divider */}
                <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

                {/* User name */}
                <span className="hidden md:block text-xs text-gray-400 dark:text-gray-500 px-2 max-w-32 truncate">{userData.name}</span>

                <NavItem icon={faPowerOff} label="Logout" onClick={handleLogout} danger />
            </div>
        </nav>
    );
}
