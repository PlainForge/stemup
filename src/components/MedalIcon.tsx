import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMedal } from "@fortawesome/free-solid-svg-icons";

const MEDAL_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-700"];

interface MedalIconProps {
    /** 0 = 1st place, 1 = 2nd place, 2 = 3rd place */
    rank: number;
    className?: string;
}

export default function MedalIcon({ rank, className }: MedalIconProps) {
    return <FontAwesomeIcon icon={faMedal} className={`${MEDAL_COLORS[rank] ?? "text-gray-400"} ${className ?? ""}`} />;
}
