import { useContext, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Nav from './components/Nav';
import Loading from './pages/Loading';
import { MainContext } from './context/MainContext';
import VerifyEmailPage from './pages/EmailVerifyPage';
import ProfilePage from './components/ProfilePage';
import BugReport from './components/BugReport';
import ConfirmHost from './components/ConfirmDialog';
import { IS_PHONE } from './lib/device';

export default function App() {
  const context = useContext(MainContext);
  const navigate = useNavigate();
  const location = useLocation();

  const user = context?.user ?? null;
  const userData = context?.userData ?? null;
  const loading = context?.loading ?? true;
  const needsVerification = context?.needsVerification ?? false;
  const justLoggedIn = context?.justLoggedIn ?? false;
  const showAccount = context?.showAccount ?? false;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", {replace: true});
    }

    // Checks if the user just logged in - redirect to their current role at first load
    if (!justLoggedIn) return;

    const role = userData?.currentRole;

    if (role) {
      navigate(`/roles/${role}`, { replace: true });
    }

    // 🔥 consume the flag so it never runs again
    context?.setJustLoggedIn(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally not depending on the whole `context` object, which gets a new reference on every provider render
  }, [
    loading,
    user,
    userData?.currentRole,
    justLoggedIn,
    navigate,
    context?.setJustLoggedIn
  ]);

  // Close the profile card and bug report overlays when navigating via the nav
  // bar, instead of leaving them floating over whatever page you land on.
  useEffect(() => {
    context?.setShowAccount(null);
    context?.setBugReportOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on route change
  }, [location.pathname]);

  if (loading) return <Loading />;
  if (user && needsVerification) return <VerifyEmailPage />;

  return (
    <div className={`flex flex-col items-center min-h-screen min-w-full ${
      IS_PHONE
        ? "pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)]"
        : "pt-20 pb-0"
    }`}>
      <Nav />
      {showAccount ? <ProfilePage /> : null}
      <BugReport />
      <ConfirmHost />
      <Outlet />
    </div>
  );
}
