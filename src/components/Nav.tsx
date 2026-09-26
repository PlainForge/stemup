import { useContext } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faPowerOff, faUserClock, faUserGraduate, faUsers } from "@fortawesome/free-solid-svg-icons";
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
            className={`relative flex items-center gap-1.5 min-w-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:cursor-pointer ${
                danger
                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                    : active
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
            }`}
        >
            <FontAwesomeIcon icon={icon} className="text-xs shrink-0" />
            <span className="hidden sm:inline truncate whitespace-nowrap">{label}</span>
            {ping && (
                <span className="absolute top-0.5 right-0.5 flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
                </span>
            )}
        </button>
    );
}

function MobileNavItem({ icon, label, onClick, active, danger, ping }: {
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
            className={`relative flex flex-col items-center gap-0.5 flex-1 min-w-0 px-1 py-1.5 rounded-xl text-xs font-medium transition-colors hover:cursor-pointer ${
                danger
                    ? "text-red-500"
                    : active
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500"
            }`}
        >
            <FontAwesomeIcon icon={icon} className="text-xl" />
            <span className="max-w-full truncate whitespace-nowrap">{label}</span>
            {ping && (
                <span className="absolute top-1 right-[22%] flex size-2">
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
    const { user, userData, roleNotification, admins } = context;

    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
        window.location.reload();
    };

    if (!user || !userData) return null;

    const path = location.pathname;
    const isAdmin = admins.includes(user.uid);

    return (
        <>
            {/* Desktop top nav */}
            <nav className="hidden sm:flex fixed top-4 left-0 right-0 z-50 justify-center px-4 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-0.5 max-w-full min-w-0 px-2 py-1.5 rounded-full backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border border-gray-200/60 dark:border-white/10 shadow-lg shadow-black/5">
                    {/* Logo */}
                    <span className="font-bold text-sm px-3 tracking-tight select-none shrink-0">StemUP</span>

                    {/* Divider */}
                    <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

                    <NavItem icon={faHomeAlt} label="Home" onClick={() => navigate("/")} active={path === "/"} />
                    <NavItem icon={faUsers} label="Roles" onClick={() => navigate("/roles")} active={path.startsWith("/roles")} ping={roleNotification} />
                    {isAdmin && (
                        <NavItem icon={faUserGraduate} label="Alumni" onClick={() => navigate("/alumni")} active={path.startsWith("/alumni")} />
                    )}
                    {isAdmin && (
                        <NavItem icon={faUserClock} label="Old Users" onClick={() => navigate("/old-users")} active={path.startsWith("/old-users")} />
                    )}
                    <NavItem icon={faGears} label="Settings" onClick={() => navigate("/settings")} active={path === "/settings"} />

                    {/* Divider */}
                    <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

                    {/* User name */}
                    <span className="hidden md:block text-xs text-gray-400 dark:text-gray-500 px-2 max-w-32 min-w-0 truncate">{userData.name}</span>

                    <NavItem icon={faPowerOff} label="Logout" onClick={handleLogout} danger />
                </div>
            </nav>

            {/* Mobile bottom nav */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 flex sm:hidden items-center justify-around px-2 py-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-gray-200/60 dark:border-white/10">
                <MobileNavItem icon={faHomeAlt} label="Home" onClick={() => navigate("/")} active={path === "/"} />
                <MobileNavItem icon={faUsers} label="Roles" onClick={() => navigate("/roles")} active={path.startsWith("/roles")} ping={roleNotification} />
                {isAdmin && (
                    <MobileNavItem icon={faUserGraduate} label="Alumni" onClick={() => navigate("/alumni")} active={path.startsWith("/alumni")} />
                )}
                {isAdmin && (
                    <MobileNavItem icon={faUserClock} label="Old Users" onClick={() => navigate("/old-users")} active={path.startsWith("/old-users")} />
                )}
                <MobileNavItem icon={faGears} label="Settings" onClick={() => navigate("/settings")} active={path === "/settings"} />
                <MobileNavItem icon={faPowerOff} label="Logout" onClick={handleLogout} danger />
            </nav>
        </>
    );
}
