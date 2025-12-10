import { motion } from "motion/react";

interface LinkButtonProps {
    children?: React.ReactNode;
    onClick?: () => void;
    moreClass?: string;
}

export default function LinkButton({children, onClick, moreClass} : LinkButtonProps) {
    return (
        <motion.a
            onClick={onClick}
            className={`
                text-center
                hover:text-[rgb(138,138,255)]
                hover:cursor-pointer
                hover:-translate-y-0.5
                transition-all duration-200
                ${moreClass}
            `}
        >
            {children}
        </motion.a>
    );
}