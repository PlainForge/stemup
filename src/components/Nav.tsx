import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsMobileBarHidden } from "../lib/useIsMobileBarHidden";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGears, faHomeAlt, faUserClock, faUserGraduate, faUsers } from "@fortawesome/free-solid-svg-icons";
import { useNavigate, useLocation } from "react-router-dom";
import { MainContext } from "../context/MainContext";
import { IS_PHONE } from "../lib/device";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type Box = { x: number; y: number; w: number; h: number };

// A bar whose highlight pill slides to whichever child has data-active="true".
// The pill is positioned relative to the bar itself (not the viewport), so page
// scrollbars appearing/disappearing between routes can't make it drift.
//
// `squishy` swaps the plain slide for the stretch-then-settle "liquid" motion of
// iOS-style tab bars (grow across the gap between the old and new tab, then
// contract to fit the new one) — driven imperatively via the Web Animations API
// so the stretch keyframe can be computed fresh from the actual pixel gap each time.
function PillBar({ activeKey, className, pillClassName, squishy, children }: {
    activeKey: string;
    className: string;
    pillClassName: string;
    squishy?: boolean;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLSpanElement>(null);
    const prevBoxRef = useRef<Box | null>(null);
    const [box, setBox] = useState<Box | null>(null);
    const [ready, setReady] = useState(false);

    const measure = useCallback(() => {
        const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
        const newBox: Box | null = el
            ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
            : null;
        setBox(newBox);

        if (squishy && newBox && pillRef.current) {
            const prev = prevBoxRef.current;
            if (prev && (prev.x !== newBox.x || prev.w !== newBox.w)) {
                const unionLeft = Math.min(prev.x, newBox.x);
                const unionRight = Math.max(prev.x + prev.w, newBox.x + newBox.w);
                pillRef.current.animate(
                    [
                        { left: `${prev.x}px`, width: `${prev.w}px`, offset: 0, easing: "cubic-bezier(0.3,0,0.4,1)" },
                        { left: `${unionLeft}px`, width: `${unionRight - unionLeft}px`, offset: 0.45, easing: "cubic-bezier(0.5,0,0.15,1)" },
                        { left: `${newBox.x}px`, width: `${newBox.w}px`, offset: 1 },
                    ],
                    { duration: 420, fill: "none" }
                );
            }
        }
        if (newBox) prevBoxRef.current = newBox;
    }, [squishy]);

    useLayoutEffect(() => { measure(); }, [measure, activeKey]);

    // Enable the (non-squishy) slide transition only after the first measurement so it doesn't fly in on load
    useEffect(() => {
        const id = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id);
    }, []);

    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(measure);
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [measure]);

    return (
        <div ref={ref} className={`relative ${className}`}>
            {box && (
                squishy ? (
                    <span
                        ref={pillRef}
                        aria-hidden
                        className={`absolute rounded-full pointer-events-none ${pillClassName}`}
                        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                    />
                ) : (
                    <span
                        aria-hidden
                        className={`absolute left-0 top-0 rounded-full pointer-events-none ${pillClassName} ${
                            ready ? "transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]" : ""
                        }`}
                        style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}
                    />
                )
            )}
            {children}
        </div>
    );
}

function NavItem({ icon, label, onClick, active, ping }: {
    icon: IconDefinition;
    label: string;
    onClick: () => void;
    active?: boolean;
    ping?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            data-active={active ? "true" : "false"}
            className={`relative flex items-center gap-1.5 min-w-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-300 hover:cursor-pointer ${
                active
                    ? "text-white dark:text-gray-900"
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

function MobileNavItem({ icon, label, onClick, active, ping }: {
    icon: IconDefinition;
    label: string;
    onClick: () => void;
    active?: boolean;
    ping?: boolean;
}) {
    const iconRef = useRef<HTMLSpanElement>(null);
    const wasActive = useRef(active);

    // Icon "pops" with a springy overshoot the moment its tab becomes active,
    // instead of just recoloring — same tap feedback GitHub/PayPal's tab bars use.
    useEffect(() => {
        if (active && !wasActive.current) {
            iconRef.current?.animate(
                [
                    { transform: "scale(1)" },
                    { transform: "scale(1.28)", offset: 0.5 },
                    { transform: "scale(1)" },
                ],
                { duration: 380, easing: "cubic-bezier(0.34,1.56,0.64,1)" }
            );
        }
        wasActive.current = active;
    }, [active]);

    return (
        <button
            onClick={onClick}
            data-active={active ? "true" : "false"}
            className={`relative flex flex-col items-center gap-0.5 flex-1 min-w-0 px-1 py-2 rounded-full text-[11px] font-medium transition-[color,transform] duration-300 active:scale-90 hover:cursor-pointer ${
                active
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-200"
            }`}
        >
            <span ref={iconRef} className="inline-block">
                <FontAwesomeIcon icon={icon} className="text-xl" />
            </span>
            <span className="max-w-full truncate whitespace-nowrap">{label}</span>
            {ping && (
                <span className="absolute top-1.5 right-[22%] flex size-2">
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
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        if (IS_PHONE) return;
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const barHidden = useIsMobileBarHidden(IS_PHONE);

    if (!context) return null;
    const { user, userData, roleNotification, admins } = context;

    if (!user || !userData) return null;

    const path = location.pathname;
    const isAdmin = admins.includes(user.uid);
    const activeKey = `${path.split("/")[1] ?? ""}|${isAdmin}`;

    // Real device detection, not a viewport-width breakpoint — a laptop keeps the
    // top bar even with a narrow window; only an actual phone gets the bottom one.
    if (IS_PHONE) {
        return (
            <nav
                className={`fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom)+0.25rem)] z-50 flex justify-center px-4 pointer-events-none transition-transform duration-300 ease-out ${
                    barHidden ? "translate-y-24" : "translate-y-0"
                }`}
            >
                <PillBar
                    activeKey={activeKey}
                    squishy
                    pillClassName="bg-black/10 dark:bg-white/15"
                    className="pointer-events-auto flex items-center w-full max-w-md p-1.5 rounded-full bg-white/40 dark:bg-gray-900/40 backdrop-blur-2xl backdrop-saturate-200 border border-white/50 dark:border-white/10 shadow-xl shadow-black/10"
                >
                    <MobileNavItem icon={faHomeAlt} label="Home" onClick={() => navigate("/")} active={path === "/"} />
                    <MobileNavItem icon={faUsers} label="Roles" onClick={() => navigate("/roles")} active={path.startsWith("/roles")} ping={roleNotification} />
                    {isAdmin && (
                        <MobileNavItem icon={faUserGraduate} label="Alumni" onClick={() => navigate("/alumni")} active={path.startsWith("/alumni")} />
                    )}
                    {isAdmin && (
                        <MobileNavItem icon={faUserClock} label="Old Users" onClick={() => navigate("/old-users")} active={path.startsWith("/old-users")} />
                    )}
                    <MobileNavItem icon={faGears} label="Settings" onClick={() => navigate("/settings")} active={path === "/settings"} />
                </PillBar>
            </nav>
        );
    }

    return (
        <nav className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
            <PillBar
                activeKey={activeKey}
                pillClassName="bg-gray-900 dark:bg-white"
                className={`pointer-events-auto flex items-center gap-0.5 max-w-full min-w-0 px-2 py-1.5 rounded-full backdrop-blur-2xl backdrop-saturate-150 border border-gray-200/60 dark:border-white/10 shadow-lg shadow-black/5 transition-[background-color,box-shadow] duration-300 ${
                    scrolled ? "bg-white/50 dark:bg-gray-900/50" : "bg-white dark:bg-gray-900"
                }`}
            >
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

                {/* User name */}
                <div className="hidden md:block w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
                <span className="hidden md:block text-xs text-gray-400 dark:text-gray-500 px-2 max-w-32 min-w-0 truncate">{userData.name}</span>
            </PillBar>
        </nav>
    );
}
