import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface AlertProps {
    value: string;
    setValue: (val: string) => void;
}

export function Alert({value, setValue}:AlertProps) {
    const [display, setDisplay] = useState(true);
    
    useEffect(() => {
        setDisplay(true);
        setTimeout(() => {
            setValue("");
            setDisplay(false);
        }, 3000)
    }, [value, setValue])

    return (
        <motion.div
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
            className={display ? "block transition-all duration-200" : "hidden transition-all duration-200"}
        >
            {value}
        </motion.div>
    )
}