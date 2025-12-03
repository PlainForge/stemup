import { useContext, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import "./App.css";
import Nav from './components/Nav';
import Loading from './pages/Loading';
import { MainContext } from './context/MainContext';
import VerifyEmailPage from './pages/EmailVerifyPage';

export default function App() {
  const context = useContext(MainContext);
  const navigate = useNavigate();

  const user = context?.user ?? null;
  const loading = context?.loading ?? true;
  const needsVerification = context?.needsVerification ?? true;

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <Loading />;
  if (user && needsVerification) return <VerifyEmailPage />;
  
  if (!user) {
    return (
      <div className="app">
        <Outlet />
      </div>
    );
  } else {
    return (
      <div className="app">
        <Nav />
        <Outlet />
      </div>
    );
  }
}
