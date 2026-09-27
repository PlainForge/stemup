import { useEffect, useState } from "react";
import Button from "./Button";
import { registerConfirmHost, type ConfirmRequest } from "../lib/confirm";

// Mount once (in App) — renders whichever dialog is currently requested
export default function ConfirmHost() {
    const [req, setReq] = useState<ConfirmRequest | null>(null);

    // Plain CSS entrance transition, same fix/pattern as the profile card and bug report panel
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        registerConfirmHost(setReq);
        return () => registerConfirmHost(null);
    }, []);

    useEffect(() => {
        if (!req) {
            setEntered(false);
            return;
        }
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, [req]);

    if (!req) return null;

    const close = (ok: boolean) => {
        req.resolve(ok);
        setReq(null);
    };

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center px-6 bg-black/60 transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={() => close(false)}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                className={`w-full max-w-xs bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4 text-center transition-all duration-150 ${
                    entered ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-bold">{req.title ?? (req.alertOnly ? "Notice" : "Are you sure?")}</h2>
                <p className="text-sm text-gray-500 leading-relaxed">{req.message}</p>
                <div className="flex gap-2">
                    {!req.alertOnly && (
                        <Button color="gray" size="full" onClick={() => close(false)}>
                            {req.cancelLabel ?? "Cancel"}
                        </Button>
                    )}
                    <Button color={req.danger ? "red" : "blue"} size="full" onClick={() => close(true)}>
                        {req.confirmLabel ?? "Confirm"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
