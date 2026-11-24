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
    /** Show a text field (replacement for window.prompt) */
    input?: { type?: "text" | "password" | "email"; placeholder?: string; autoComplete?: string };
};

export type ConfirmRequest = ConfirmOptions & { message: string; resolve: (ok: boolean, value?: string) => void };

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

/**
 * In-app replacement for window.prompt. Resolves with the entered text, or null
 * if cancelled. Use input.type "password" to keep the text hidden while typing.
 */
export function promptDialog(message: string, options: ConfirmOptions & { input: NonNullable<ConfirmOptions["input"]> }): Promise<string | null> {
    return new Promise((resolve) => {
        if (!show) {
            resolve(window.prompt(message));
            return;
        }
        show({ message, ...options, resolve: (ok, value) => resolve(ok ? value ?? "" : null) });
    });
}
