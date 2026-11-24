import { useState } from "react";
import { motion } from "motion/react";
import { FirebaseError } from "firebase/app";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faApple, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "./Button";
import LinkButton from "./LinkButton";
import Input from "./Input";
import ErrorMessage from "./ErrorMessage";
import { firebaseAuthService } from "../lib/firebaseService";

interface LoginCardProps {
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
    phrase: string;
    setPhrase: (phrase: string) => void;
    handleGoogleLogin: () => Promise<void>;
    handleAppleLogin: () => Promise<void>;
    loginWithEmail: () => Promise<void>;
}


export default function LoginCard({email, setEmail, password, setPassword, phrase, handleGoogleLogin, handleAppleLogin, loginWithEmail}: LoginCardProps) {
    const navigate = useNavigate?.();
    const location = useLocation();
    const isLogin = location.pathname === '/login';
    
    const handleSwitch = () => {
        navigate(isLogin ? "/register" : "/login");
    };

    // Forgot password: swaps the card to a "send reset link" view
    const [resetting, setResetting] = useState(false);
    const [resetSentTo, setResetSentTo] = useState("");
    const [resetError, setResetError] = useState("");
    const [resetBusy, setResetBusy] = useState(false);

    const sendReset = async () => {
        if (!email.trim()) return;
        setResetBusy(true);
        setResetError("");
        try {
            await firebaseAuthService.sendPasswordReset(email);
            setResetSentTo(email.trim());
        } catch (err) {
            const code = err instanceof FirebaseError ? err.code : "";
            setResetError(
                code === "auth/invalid-email" ? "That email address doesn't look right."
                : code === "auth/too-many-requests" ? "Too many attempts. Please wait a bit and try again."
                : "Couldn't send the reset email. Please try again."
            );
        } finally {
            setResetBusy(false);
        }
    };

    const closeReset = () => {
        setResetting(false);
        setResetSentTo("");
        setResetError("");
    };

    if (resetting) {
        return (
            <motion.div
                className="w-full flex flex-col gap-5 bg-white rounded-2xl shadow-md p-8"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.15 }}
            >
                <div>
                    <h2 className="text-2xl font-bold">Reset password</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {resetSentTo
                            ? `If an account with a password exists for ${resetSentTo}, a reset link is on its way. Check your spam folder if you don't see it.`
                            : "Enter your account's email and we'll send you a link to set a new password."}
                    </p>
                </div>
                {!resetSentTo &&
                    <form className="flex flex-col gap-3" onSubmit={async (e) => {
                        e.preventDefault();
                        await sendReset();
                    }}>
                        <Input
                            size="full"
                            type="email"
                            placeholder="Email"
                            value={email}
                            setValue={setEmail}
                            required={true}
                            autocomplete="email"
                        />
                        {resetError !== "" && <ErrorMessage>{resetError}</ErrorMessage>}
                        <Button size="full" type="submit" disabled={resetBusy}>
                            {resetBusy ? "Sending..." : "Send reset link"}
                        </Button>
                    </form>
                }
                <LinkButton onClick={closeReset} moreClass="text-sm text-gray-500">Back to sign in</LinkButton>
            </motion.div>
        );
    }
    
    return (
        <motion.div
            className="w-full flex flex-col gap-5 bg-white rounded-2xl shadow-md p-8"
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.15 }}
        >
            <div>
                <h2 className="text-2xl font-bold">Sign In</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Don't have an account?{" "}
                    <LinkButton onClick={handleSwitch}>Sign Up</LinkButton>
                </p>
            </div>

            <form className="flex flex-col gap-3" action={loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await loginWithEmail();
            }}>
                <Input
                    size="full"
                    type="email"
                    placeholder="Email"
                    value={email}
                    setValue={setEmail}
                    required={true}
                    autocomplete="false"
                />
                <Input
                    size="full"
                    type="password"
                    placeholder="Password"
                    value={password}
                    setValue={setPassword}
                    required
                    autocomplete="true"
                />
                <LinkButton onClick={() => setResetting(true)} moreClass="self-end text-sm text-gray-500 -mt-1">
                    Forgot password?
                </LinkButton>
                {phrase !== "" &&
                    <ErrorMessage>{phrase}</ErrorMessage>
                }
                <Button size="full">Sign In</Button>
            </form>

            <div className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="flex-1 h-px bg-gray-200" />
                <span>or</span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="flex flex-col gap-3">
                {firebaseAuthService.appleSupported &&
                    <Button size="full" color="apple" onClick={handleAppleLogin}>
                        <FontAwesomeIcon icon={faApple} className="mr-2" />
                        Continue with Apple
                    </Button>
                }
                <Button size="full" onClick={handleGoogleLogin}>
                    <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                    Continue with Google
                </Button>
            </div>
        </motion.div>
    )
}