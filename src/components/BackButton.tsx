import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";

/** The "‹ Roles" back button used on every page: a blue pill so it's easy to spot. */
export default function BackButton({ label, onClick, className = "" }: {
    label: string;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`self-start inline-flex items-center gap-1.5 pl-2.5 pr-4 py-1.5 rounded-full text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors hover:cursor-pointer group ${className}`}
        >
            <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            {label}
        </button>
    );
}
