import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LoginPage from "./pages/LoginPage";
import RolePage from "./pages/RolePage";
import RolesSelectorPage from "./pages/RolesSelectorPage";
import Settings from "./pages/SettingsPage";
import RegisterPage from "./pages/RegisterPage";
import Home from "./pages/Home";
import Loading from "./pages/Loading";
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/register",
    element: <RegisterPage />
  },
  {
    path: "/loading",
    element: <Loading />
  },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "settings", element: <Settings /> },
      { path: "roles", element: <RolesSelectorPage /> },

      {
        path: "roles/:id",
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <RolePage /> },
        ],
      },
    ],
  },
]);