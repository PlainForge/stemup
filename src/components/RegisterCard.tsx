import { motion } from "motion/react";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Input from "./Input";
import Button from "./Button";
import LinkButton from "./LinkButton";
import ErrorMessage from "./ErrorMessage";

interface RegisterCardProps {
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
    name: string,
    setName: (name: string) => void;
    phrase: string;
    setPhrase: (phrase: string) => void;
    registerWithEmail: () => Promise<void>;
    setSignInEmail: (value: boolean) => void;
}

export default function RegisterCard({email, setEmail, password, setPassword, name, setName, phrase, registerWithEmail, setSignInEmail}: RegisterCardProps) {
    return (
        <motion.div
            className="w-full flex flex-col gap-5 bg-white rounded-2xl shadow-md p-8"
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.15 }}
        >
            <div>
                <h2 className="text-2xl font-bold">Create your account</h2>
                <LinkButton onClick={() => setSignInEmail(false)}>
                    <FontAwesomeIcon icon={faArrowLeft} className="mr-1" /> Back
                </LinkButton>
            </div>
            <form className="flex flex-col gap-3 text-black" action={registerWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await registerWithEmail();
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
                    required={true}
                    autocomplete="false"
                />
                <Input
                    size="full"
                    type="text"
                    placeholder="Display Name"
                    value={name}
                    setValue={setName}
                    maxLength={16}
                    required={true}
                    autocomplete="false"
                />
                {phrase !== "" &&
                    <ErrorMessage>{phrase}</ErrorMessage>
                }
                <Button size="full">Register</Button>
            </form>
        </motion.div>
    )
}