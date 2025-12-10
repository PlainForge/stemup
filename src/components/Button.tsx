import { motion } from "motion/react";

interface ButtonProps {
    size?: string,
    type?: "button" | "submit" | "reset",
    color?: string,
    extraClasses?: string,
    children: React.ReactNode;
    onClick?: () => void,
    disabled?: boolean,
}

export default function Button({size, type, color, extraClasses, children, onClick, disabled} : ButtonProps) {
    if (size === undefined) size = "md";
    if (color === undefined) color = "neutral";
    const selectColor = {
        neutral: "text-white bg-[rgb(24,24,24)] hover:bg-[rgb(24,24,255)]",
        red: "text-white bg-[rgb(255,24,24)] hover:bg-[rgb(255,100,100)]",
        gray: "text-black bg-[rgb(200,200,200)] hover:bg-[rgb(170,170,170)]",
        blue: "text-white bg-blue-600 hover:bg-blue-800",
        green: "text-white bg-green-600 hover:bg-green-700",
    }[color];
    const sizeClass = {
        xsm: "w-22 lg:w-32 px-2",
        sm: "w-32 lg:w-52",
        md: "w-52 lg:w-72",
        lg: "w-72 lg:w-92",
        full: "w-full",
    }[size];
    return (
        <motion.button 
            onClick={onClick} 
            type={type}
            className={`
                ${selectColor}
                ${sizeClass}
                py-2 rounded-xl
                hover:cursor-pointer
                hover:rounded-lg
                transition-all duration-200 ease-in-out
                ${extraClasses}
            `}
            disabled={disabled}
        >
            {children}
        </motion.button>
    )
}