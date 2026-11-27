import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { roleLook } from "../lib/roleIcons";

const SIZES = {
    sm: { box: "size-8 rounded-lg", icon: "text-sm" },
    md: { box: "size-10 rounded-xl", icon: "text-base" },
    lg: { box: "size-14 rounded-2xl", icon: "text-2xl" },
};

/**
 * A role's icon in its color: a soft tinted badge, or a solid one when [solid]
 * (e.g. the role you're currently in).
 */
export default function RoleIcon({ role, size = "md", solid = false, className = "" }: {
    role: { icon?: string; iconColor?: string } | null | undefined;
    size?: keyof typeof SIZES;
    solid?: boolean;
    className?: string;
}) {
    const { icon, color } = roleLook(role);
    const s = SIZES[size];
    return (
        <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center transition-colors ${s.box} ${className}`}
            style={solid ? { backgroundColor: color.hex, color: "#fff" } : { backgroundColor: `${color.hex}1f`, color: color.hex }}
        >
            <FontAwesomeIcon icon={icon.icon} className={s.icon} />
        </span>
    );
}
