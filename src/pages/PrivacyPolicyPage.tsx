// /privacy — also linked from the iOS app (mobile/lib/screens/auth_screens.dart).
// Keep it in step with what the apps and Cloud Functions actually do.
export default function PrivacyPolicyPage() {
    const p = "text-sm text-gray-600 leading-relaxed";
    const list = "list-disc list-inside text-sm text-gray-600 leading-relaxed flex flex-col gap-1";
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-10">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold">Privacy Policy</h1>
                    <p className="text-sm text-gray-400 mt-1">Last updated: November 27, 2026</p>
                </div>

                <p className={p}>
                    StemUP ("the app") is a task and points tracking app used by student roles/teams. This page explains
                    what information the app collects, who can see it, how it's used, and how to have it removed.
                </p>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Information we collect</h2>
                    <p className={p}>When you create an account (with Sign in with Apple, Google, or email/password), we collect:</p>
                    <ul className={list}>
                        <li>Your name and email address</li>
                        <li>A profile photo, if you provide one or sign in with Google (Apple doesn&apos;t share a photo)</li>
                        <li>An &quot;About Me&quot; bio, if you choose to write one (200 words at most)</li>
                        <li>App activity: tasks assigned and completed, points earned, and which roles/teams you belong to (and, for Instructors, the roles you run and how many tasks you&apos;ve given)</li>
                        <li>Messages you send in a role&apos;s group chat or in a task&apos;s questions, if those are turned on for your role (see &quot;Messages&quot; below)</li>
                        <li>Bug reports and feature requests you choose to send, including the text you write, your email address and your account ID</li>
                        <li>Your settings, such as your notification choices and which roles show on your Home page and profile</li>
                        <li>If you turn on push notifications, a push token for each device you use</li>
                    </ul>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Who can see your profile</h2>
                    <p className={p}>
                        Anyone signed in to StemUP can open your profile card and your user page. These show your name,
                        photo, About Me, points, tasks completed and the roles you&apos;re in (and, for Instructors, the roles
                        you run and how many tasks you&apos;ve given). Your email address isn&apos;t shown there.
                    </p>
                    <ul className={list}>
                        <li>
                            <strong>Hiding a role:</strong> you can hide any role from your card and user page in that role&apos;s
                            Settings tab. Admins and that role&apos;s instructors can still see that you&apos;re in it, because they
                            manage its members.
                        </li>
                        <li>
                            <strong>Instructors</strong> can see and change your points, tasks and membership in the roles they
                            run, and can invite you to join a role.
                        </li>
                        <li>
                            <strong>Admins</strong> can see everything described on this page, including your email address and
                            access level, so they can manage accounts and keep the app safe.
                        </li>
                    </ul>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Messages</h2>
                    <p className={p}>
                        A role can have a group chat and task questions. Both are off unless the role&apos;s owner or an admin
                        turns them on. StemUP has no private messages between members.
                    </p>
                    <ul className={list}>
                        <li>
                            <strong>Group chat:</strong> everyone in the role can read and send messages. Each message stores
                            your name, photo, the text and when it was sent.
                        </li>
                        <li>
                            <strong>Task questions:</strong> a thread on a single task, readable only by the person doing the
                            task and whoever gave it (or, for older tasks that don&apos;t record who gave them, the role&apos;s
                            instructors), plus admins.
                        </li>
                        <li>
                            <strong>Automatic filtering:</strong> our servers check every message before it&apos;s saved. Profanity
                            is replaced with asterisks (*), and the original wording isn&apos;t kept. To stop spam, sending more
                            than 5 messages in 10 seconds pauses your sending for 30 seconds; to do this we keep the times of
                            your last few messages.
                        </li>
                        <li>
                            <strong>Removing messages:</strong> you can delete your own messages at any time. A role&apos;s
                            instructors and admins can delete any message in its group chat, and the role&apos;s owner or an
                            admin can clear the whole chat. A task&apos;s questions are deleted when the task is deleted, and
                            cleared when it&apos;s given to someone else. All of a role&apos;s messages are deleted when the role
                            is deleted.
                        </li>
                    </ul>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Notifications</h2>
                    <p className={p}>
                        StemUP can tell you when you get a new task, when an instructor or admin changes one of your tasks,
                        when something you asked for is approved or declined (task submissions, extensions, joining a role,
                        Instructor access, new roles and role changes), when you&apos;re invited to a role, and when there&apos;s
                        a new message in a group chat or on one of your tasks. Push notifications and email notifications are
                        both off until you turn them on, and you can turn each kind on or off in Settings &rarr; Notifications,
                        or turn off everything about one role in that role&apos;s Settings tab.
                    </p>
                    <ul className={list}>
                        <li>
                            <strong>Push notifications (iOS app):</strong> when you turn them on, iOS asks for your permission
                            and gives the app a push token, an identifier for your device that lets us send it notifications.
                            We store this token with your account and send notifications through Google&apos;s Firebase Cloud
                            Messaging and Apple&apos;s Push Notification service. A notification contains a short message, such as
                            a task&apos;s title and role, or the sender&apos;s name and the start of a message, and the page to
                            open. The token is removed when you sign out, turn push notifications off, or delete your account.
                            You can also block notifications at any time in your iPhone&apos;s Settings.
                        </li>
                        <li>
                            <strong>Email notifications:</strong> when you turn them on, we send the same notifications to the
                            email address on your account through Google&apos;s Gmail service. Chat and task question messages
                            are never sent by email.
                        </li>
                        <li>
                            <strong>Admins</strong> can also choose to be emailed each new bug report and feature request, which
                            includes what was written and the sender&apos;s email address.
                        </li>
                    </ul>
                    <p className={p}>
                        Notifications are only about activity in StemUP. We don&apos;t use them for advertising.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Sign in with Apple</h2>
                    <p className={p}>
                        If you use Sign in with Apple, Apple asks you what to share with StemUP. We receive only:
                    </p>
                    <ul className={list}>
                        <li>Your name, as you choose to share it. Apple sends it only the first time you sign in, and you can change it later in Settings.</li>
                        <li>
                            Your email address, or, if you choose &quot;Hide My Email&quot;, a private relay address from Apple
                            that forwards to your real inbox. We never see your real address in that case.
                        </li>
                        <li>An anonymous identifier from Apple that lets us recognize your account when you sign in again.</li>
                    </ul>
                    <p className={p}>
                        We never receive your Apple ID password. You can stop using Sign in with Apple with StemUP at any time
                        from your iPhone&apos;s Settings &rarr; your name &rarr; Sign-In &amp; Security &rarr; Sign in with Apple,
                        or at appleid.apple.com.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Linked sign-in methods</h2>
                    <p className={p}>
                        If you sign in with more than one method that uses the same email address (for example, Google and
                        Apple), we link them to the same StemUP account so you see the same profile either way. Accounts
                        created with an Apple private relay address aren&apos;t linked, because that address differs from your
                        real email.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Changing your email</h2>
                    <p className={p}>
                        If you sign in with an email and password, you can change your email in Settings &rarr; Profile.
                        You&apos;ll be asked for your password first, then we email a confirmation link to the new address.
                        Until you click it, we keep the new address with your account only to show that it isn&apos;t verified
                        yet; your email doesn&apos;t change, and you can cancel. Once confirmed, the new address replaces the old
                        one and you sign in again with it. If you sign in with Google or Apple, your email comes from that
                        account and can&apos;t be changed in StemUP.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Camera and photo access</h2>
                    <p className={p}>
                        The iOS app asks for camera or photo library access only when you choose to set a profile photo.
                        The photo you pick is uploaded as your profile picture; the app doesn&apos;t read any other photos.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">How we use it</h2>
                    <p className={p}>
                        This information is used to run the app itself: showing your tasks, tracking your points, displaying
                        leaderboards and profiles, delivering messages and notifications, and fixing problems you report.
                        Your name, photo and points are visible to other members as part of the leaderboard and task
                        features &mdash; that visibility is the core purpose of the app. Names, About Me and messages are
                        checked automatically for profanity. Admins can choose to let you see the leaderboard for the whole
                        club. We don&apos;t use your data for advertising, and we don&apos;t sell or share it with third parties
                        beyond the service providers below.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Where it&apos;s stored</h2>
                    <p className={p}>
                        StemUP is built on Google Firebase (Authentication, Firestore, Storage and Cloud Functions). Your data,
                        including messages, is stored on Firebase&apos;s infrastructure and transmitted over encrypted (HTTPS)
                        connections. Firebase acts as our data processor and doesn&apos;t use your information for its own
                        purposes.
                    </p>
                    <p className={p}>
                        Account emails, such as email verification and password reset links, and any email notifications
                        you turn on, are sent through Google&apos;s Gmail service. Push notifications are delivered through
                        Firebase Cloud Messaging and Apple&apos;s Push Notification service. If you sign in with Apple or
                        Google, that company handles the sign-in itself under its own privacy policy and tells us only the
                        details listed above.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Semester resets and archives</h2>
                    <p className={p}>
                        At the end of a semester, an admin may reset a role. If your account is archived as part of this,
                        your name, photo, and final points/tasks totals are kept in a read-only "Alumni" record visible only
                        to admins, so the club can keep track of past semesters. Your individual task history and role data
                        are deleted at that point, and your account can be restored by an admin if needed.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Your choices</h2>
                    <p className={p}>
                        You can delete your account and all associated data at any time from Settings &rarr; Delete My
                        Account. This permanently removes your profile, profile photo, About Me, tasks, requests, role
                        memberships, invitations, the messages you sent in group chats and task questions, notification
                        settings, and push tokens. If anything is left behind (for example, if your connection drops partway
                        through), our servers remove it automatically once your account is deleted. Bug reports and feature
                        requests you sent are kept until an admin dismisses them; contact us below to have yours removed
                        sooner.
                    </p>
                    <p className={p}>
                        You can also edit or remove your About Me, hide roles from your profile, delete your own messages, and
                        turn notifications off at any time. If you signed in with Apple, deleting your account in the iOS app
                        also revokes StemUP&apos;s access to your Apple ID.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Children&apos;s privacy</h2>
                    <p className={p}>
                        StemUP is intended for college students and is not directed at children under 13.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Changes to this policy</h2>
                    <p className={p}>
                        If this policy changes, the updated version will be posted on this page with a new "last updated" date.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">Contact</h2>
                    <p className={p}>
                        Questions about this policy or your data can be sent to{" "}
                        <a href="mailto:stemup.support@gmail.com" className="text-blue-600 hover:underline">stemup.support@gmail.com</a>.
                    </p>
                </section>
            </div>
        </div>
    );
}
