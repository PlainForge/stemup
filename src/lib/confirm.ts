// In-app replacement for window.confirm / window.alert so prompts look and
// behave the same in the browser and inside the iOS app. <ConfirmHost /> (mounted
// once in App) renders whatever is requested here.

export type ConfirmOptions = {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    /** Show only an OK button (replacement for window.alert) */
    alertOnly?: boolean;
};

export type ConfirmRequest = ConfirmOptions & { message: string; resolve: (ok: boolean) => void };

let show: ((req: ConfirmRequest) => void) | null = null;

export function registerConfirmHost(fn: ((req: ConfirmRequest) => void) | null) {
    show = fn;
}

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
        if (!show) {
            resolve(window.confirm(message));
            return;
        }
        show({ message, resolve, ...options });
    });
}

export function alertDialog(message: string, title?: string): Promise<boolean> {
    return confirmDialog(message, { title, alertOnly: true, confirmLabel: "OK" });
}
