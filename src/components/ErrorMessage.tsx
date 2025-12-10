import { motion } from "motion/react";

interface ErrorMessageProps {
    children: React.ReactNode;
}

export default function ErrorMessage({children}:ErrorMessageProps) {
    return (
        <motion.p 
            className="w-52 lg:w-72 rounded-xl bg-red-400 text-white px-2 py-2 text-center"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            {children}
        </motion.p>
    )
}