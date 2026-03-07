import { sendEmailVerification } from "firebase/auth";
import { useContext, useState } from "react";
import { MainContext } from "../context/MainContext";
import { motion } from "motion/react";
import Button from "../components/Button";

export default function VerifyEmailPage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const [sent, setSent] = useState(false);

    const resend = async () => {
        if (!user) return;
        await sendEmailVerification(user);
        setSent(true);
        setTimeout(() => setSent(false), 5000);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white rounded-2xl shadow-md p-10 max-w-sm w-full flex flex-col items-center gap-5 text-center"
            >
                <div className="size-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
                    ✉️
                </div>
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold">Verify your email</h1>
                    <p className="text-sm text-gray-500">
                        We sent a verification link to <strong>{user?.email}</strong>. Click it to continue.
                    </p>
                </div>
                <Button onClick={resend} color="blue" size="sm">
                    {sent ? "Email sent!" : "Resend email"}
                </Button>
                <p className="text-xs text-gray-400">This page will update automatically once verified.</p>
            </motion.div>
        </div>
    );
}