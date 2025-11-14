import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LoginPage from "./pages/LoginPage";
import RolePage from "./pages/RolePage";
import Dash from "./components/Dash";
import Roles from "./pages/RolesSelectorPage";
import Settings from "./pages/SettingsPage";
import RegisterPage from "./pages/RegisterPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dash /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "settings", element: <Settings /> },  
      { path: "roles", element: <Roles /> },
      { path: "roles/:id", element: <RolePage /> },
    ],
  },
]);