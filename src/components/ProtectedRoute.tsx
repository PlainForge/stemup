import { Navigate, Outlet } from "react-router-dom";
import { useContext } from "react";
import { MainContext } from "../context/MainContext";
import Loading from "../pages/Loading";

export default function ProtectedRoute() {
  const context = useContext(MainContext);
  if (!context) return null;
  const {user, loading} = context;

  if (loading) return <Loading />;

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}