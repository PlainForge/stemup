export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-10">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold">Privacy Policy</h1>
                    <p className="text-sm text-gray-400 mt-1">Last updated: November 23, 2026</p>
                </div>

                <p className="text-sm text-gray-600 leading-relaxed">
                    StemUP ("the app") is a task and points tracking app used by student roles/teams. This page explains
                    what information the app collects, how it's used, and how to have it removed.
                </p>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Information we collect</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">When you create an account (with Sign in with Apple, Google, or email/password), we collect:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 leading-relaxed flex flex-col gap-1">
                        <li>Your name and email address</li>
                        <li>A profile photo, if you provide one or sign in with Google (Apple doesn&apos;t share a photo)</li>
                        <li>App activity: tasks assigned and completed, points earned, and which roles/teams you belong to</li>
                        <li>Bug reports you choose to send, including the text you write</li>
                    </ul>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Sign in with Apple</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        If you use Sign in with Apple, Apple asks you what to share with StemUP. We receive only:
                    </p>
                    <ul className="list-disc list-inside text-sm text-gray-600 leading-relaxed flex flex-col gap-1">
                        <li>Your name, as you choose to share it. Apple sends it only the first time you sign in, and you can change it later in Settings.</li>
                        <li>
                            Your email address, or, if you choose &quot;Hide My Email&quot;, a private relay address from Apple
                            that forwards to your real inbox. We never see your real address in that case.
                        </li>
                        <li>An anonymous identifier from Apple that lets us recognize your account when you sign in again.</li>
                    </ul>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        We never receive your Apple ID password. You can stop using Sign in with Apple with StemUP at any time
                        from your iPhone&apos;s Settings &rarr; your name &rarr; Sign-In &amp; Security &rarr; Sign in with Apple,
                        or at appleid.apple.com.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Linked sign-in methods</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        If you sign in with more than one method that uses the same email address (for example, Google and
                        Apple), we link them to the same StemUP account so you see the same profile either way. Accounts
                        created with an Apple private relay address aren&apos;t linked, because that address differs from your
                        real email.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Camera and photo access</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        The iOS app asks for camera or photo library access only when you choose to set a profile photo.
                        The photo you pick is uploaded as your profile picture; the app doesn&apos;t read any other photos.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">How we use it</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        This information is used to run the app itself: showing your tasks, tracking your points, and
                        displaying leaderboards. Your name, photo, and points are visible to other members of your role/team
                        as part of the leaderboard and task features &mdash; that visibility is the core purpose of the app.
                        We don't use your data for advertising, and we don't sell or share it with third parties beyond the
                        service providers below.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Where it's stored</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        StemUP is built on Google Firebase (Authentication, Firestore, and Storage). Your data is stored on
                        Firebase's infrastructure and transmitted over encrypted (HTTPS) connections. Firebase acts as our
                        data processor and doesn't use your information for its own purposes.
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        Account emails, such as email verification and password reset links, are sent through Google&apos;s
                        Gmail service. If you sign in with Apple or Google, that company handles the sign-in itself under its
                        own privacy policy and tells us only the details listed above.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Semester resets and archives</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        At the end of a semester, an admin may reset a role. If your account is archived as part of this,
                        your name, photo, and final points/tasks totals are kept in a read-only "Alumni" record visible only
                        to admins, so the club can keep track of past semesters. Your individual task history and role data
                        are deleted at that point, and your account can be restored by an admin if needed.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Your choices</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        You can delete your account and all associated data at any time from Settings &rarr; Delete My
                        Account. This permanently removes your profile, tasks, and role memberships. If you signed in with
                        Apple, deleting your account in the iOS app also revokes StemUP&apos;s access to your Apple ID.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Children's privacy</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        StemUP is intended for college students and is not directed at children under 13.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Changes to this policy</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        If this policy changes, the updated version will be posted on this page with a new "last updated" date.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Contact</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        Questions about this policy or your data can be sent to{" "}
                        <a href="mailto:stemup.support@gmail.com" className="text-blue-600 hover:underline">stemup.support@gmail.com</a>.
                    </p>
                </section>
            </div>
        </div>
    );
}
