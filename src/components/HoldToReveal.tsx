import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

/**
 * The eye button inside a password field: the password shows only while it's
 * held down (mouse, finger or Space/Enter), and hides again on release. There's
 * no toggle, so a password is never left showing.
 */
export default function HoldToReveal({ shown, setShown }: { shown: boolean; setShown: (shown: boolean) => void }) {
    const hide = () => setShown(false);
    return (
        <button
            type="button"
            aria-label="Hold to show password"
            title="Hold to show password"
            aria-pressed={shown}
            // Keep focus (and the keyboard) on the field while holding
            onPointerDown={e => { e.preventDefault(); setShown(true); }}
            onPointerUp={hide}
            onPointerLeave={hide}
            onPointerCancel={hide}
            onBlur={hide}
            onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShown(true); } }}
            onKeyUp={e => { if (e.key === " " || e.key === "Enter") hide(); }}
            // A long press would otherwise open the phone's context menu
            onContextMenu={e => e.preventDefault()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 select-none touch-none [-webkit-touch-callout:none] hover:cursor-pointer"
        >
            <FontAwesomeIcon icon={shown ? faEye : faEyeSlash} />
        </button>
    );
}
