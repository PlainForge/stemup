import { sendEmailVerification } from "firebase/auth";
import { useContext } from "react";
import { MainContext } from "../context/MainContext";
import './styles/emailVerifyPage.css'

export default function VerifyEmailPage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;

    const resend = async () => {
        if (!user) return;
        await sendEmailVerification(user);
        alert("Verification email sent!");
    };


    return (
        <div className="verify-container">
            <div className="title-container">
                <h1 className="title-main text-center">Please verify your email</h1>
                <p className="sub-title text-center">Check your inbox and click on the verification link.</p>
            </div>

            <button onClick={resend} className="button-sm">Resend email</button>
        </div>
    );
}