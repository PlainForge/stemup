import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Tracks the child marked data-active="true" inside a `relative` container and
// returns a style for an absolutely-positioned underline that slides to it.
// Measured relative to the container (not the viewport), so it also works in
// scrollable and wrapping tab bars.
export function useSlidingIndicator(activeKey: string, thickness = 2) {
    // Callback ref (state) so we re-measure when the bar mounts later, e.g. after a loading screen
    const [el, ref] = useState<HTMLDivElement | null>(null);
    const [box, setBox] = useState<{ x: number; y: number; w: number } | null>(null);
    const [ready, setReady] = useState(false);

    const measure = useCallback(() => {
        const active = el?.querySelector<HTMLElement>('[data-active="true"]');
        setBox(active ? { x: active.offsetLeft, y: active.offsetTop + active.offsetHeight - thickness, w: active.offsetWidth } : null);
    }, [el, thickness]);

    useLayoutEffect(() => { measure(); }, [measure, activeKey]);

    // Only enable the slide transition after the first measurement so it doesn't fly in on load
    useEffect(() => {
        const id = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id);
    }, []);

    // Re-measure when the bar or any tab changes size (wrapping, badges appearing, resizes)
    useEffect(() => {
        if (!el) return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        Array.from(el.children).forEach(c => ro.observe(c));
        return () => ro.disconnect();
    }, [el, measure, activeKey]);

    return {
        ref,
        indicatorClass: `absolute left-0 top-0 rounded-full pointer-events-none ${
            ready ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]" : ""
        }`,
        indicatorStyle: box
            ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: thickness }
            : { display: "none" as const },
    };
}
