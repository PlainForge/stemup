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
            className="w-full h-full flex flex-col items-center justify-center gap-2" 
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.1 }}
        >
            <h2 className="text-2xl">Create your account</h2>
            <form className="w-full flex flex-col items-center justify-center gap-2 text-black" action={registerWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await registerWithEmail();
            }}>
                <Input 
                    size="sm"
                    type="email" 
                    placeholder="Email"
                    value={email}
                    setValue={setEmail}
                    required={true}
                    autocomplete="false"
                />

                <Input 
                    size="sm"
                    type="password" 
                    placeholder="Password"
                    value={password}
                    setValue={setPassword}
                    required={true}
                    autocomplete="false"
                />

                <Input 
                    size="sm"
                    type="name" 
                    placeholder="Display Name"
                    value={name}
                    setValue={setName}
                    maxLength={16} 
                    required={true}
                    autocomplete="false"
                />

                {phrase != "" && 
                    <ErrorMessage>
                        {phrase}
                    </ErrorMessage>
                }

                <Button size="sm">
                    Register
                </Button>
            </form>

            <LinkButton
                onClick={() => setSignInEmail(false)}
            >
                <FontAwesomeIcon icon={faArrowLeft}/> Go Back
            </LinkButton>
        </motion.div>
    )
}