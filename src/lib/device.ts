import { Capacitor } from "@capacitor/core";

// Whether this is an actual phone, as opposed to a laptop/desktop (even a narrow
// browser window) or a tablet. Used to decide bottom vs. top navigation — this is
// deliberately NOT a viewport-width media query, so resizing a laptop window
// narrow (or DevTools device mode) doesn't flip the layout; only the device itself
// does.
function detectIsPhone(): boolean {
    if (Capacitor.isNativePlatform()) {
        // This app only ships an iPhone-shaped layout; a native build is always a phone
        return true;
    }
    const ua = navigator.userAgent;
    const isTabletUA = /iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
    const isPhoneUA = /iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua);
    return isPhoneUA && !isTabletUA;
}

// The device type doesn't change during a session, so this only needs computing once.
export const IS_PHONE = detectIsPhone();
