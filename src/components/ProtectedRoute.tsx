import { Navigate, Outlet } from "react-router-dom";
import useUser from "../hooks/UserHook";

export default function ProtectedRoute() {
  const [user, , loading] = useUser();

  if (loading) return <p>Loading...</p>;

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}