import { useContext, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Nav from './components/Nav';
import Loading from './pages/Loading';
import { MainContext } from './context/MainContext';
import VerifyEmailPage from './pages/EmailVerifyPage';

export default function App() {
  const context = useContext(MainContext);
  const navigate = useNavigate?.();

  const user = context?.user ?? null;
  const userData = context?.userData ?? null;
  const loading = context?.loading ?? true;
  const needsVerification = context?.needsVerification ?? false;
  const justLoggedIn = context?.justLoggedIn ?? false;

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    // 🔑 only right after login
    if (!justLoggedIn) return;

    const role = userData?.currentRole;

    if (role) {
      navigate(`/roles/${role}`, { replace: true });
    }

    // 🔥 consume the flag so it never runs again
    context?.setJustLoggedIn(false);
  }, [
    loading,
    user,
    userData?.currentRole,
    justLoggedIn,
    navigate,
    context
  ]);

  if (loading) return <Loading />;
  if (user && needsVerification) return <VerifyEmailPage />;
  
  return (
    <div className="flex flex-col items-center min-h-screen min-w-full pt-4">
      <Nav />
      <Outlet />
    </div>
  );
}
