import { useEffect, useRef, useState } from "react";

// Tracks scroll direction so the mobile nav bar can tuck itself away while
// scrolling down (more room to read) and reappear on any upward scroll or near
// the top of the page — the same "liquid glass" tab bar behavior recent
// GitHub/PayPal app redesigns use.
export function useIsMobileBarHidden(enabled: boolean) {
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        lastY.current = window.scrollY;

        const onScroll = () => {
            const y = window.scrollY;
            const delta = y - lastY.current;
            if (y < 40) {
                setHidden(false);
            } else if (delta > 8) {
                setHidden(true);
            } else if (delta < -8) {
                setHidden(false);
            }
            lastY.current = y;
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [enabled]);

    return enabled && hidden;
}
