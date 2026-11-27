import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import LoginPage from "./pages/LoginPage";
import RolePage from "./pages/RolePage";
import RoleMemberPage from "./pages/RoleMemberPage";
import RolesSelectorPage from "./pages/RolesSelectorPage";
import Settings from "./pages/SettingsPage";
import RegisterPage from "./pages/RegisterPage";
import Home from "./pages/Home";
import Loading from "./pages/Loading";
import ProtectedRoute from "./components/ProtectedRoute";
import AlumniBatchPage from "./pages/AlumniBatchPage";
import AdminPage from "./pages/AdminPage";
import AdminRolePage from "./pages/AdminRolePage";
import AdminUserPage from "./pages/AdminUserPage";
import UserPage from "./pages/UserPage";
import InstructorPage from "./pages/InstructorPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TasksPage from "./pages/TasksPage";

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
    path: "/privacy",
    element: <PrivacyPolicyPage />
  },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "settings", element: <Settings /> },
      { path: "settings/:section", element: <Settings /> },
      { path: "roles", element: <RolesSelectorPage /> },
      { path: "tasks", element: <TasksPage /> },
      // Anyone's page, under whichever tab it was opened from (admins see the full admin user page)
      { path: "users/:uid", element: <UserPage /> },
      { path: "roles/users/:uid", element: <UserPage /> },
      { path: "tasks/users/:uid", element: <UserPage /> },
      { path: "instructor/users/:uid", element: <UserPage /> },
      { path: "settings/users/:uid", element: <UserPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "admin/roles/:id", element: <AdminRolePage /> },
      // A member's page opened from the Admin or Instructor tab stays under that tab
      { path: "admin/roles/:id/members/:uid", element: <RoleMemberPage /> },
      { path: "instructor", element: <InstructorPage /> },
      { path: "instructor/roles/:id", element: <AdminRolePage mode="instructor" /> },
      { path: "instructor/roles/:id/members/:uid", element: <RoleMemberPage /> },
      { path: "admin/users/:uid", element: <AdminUserPage /> },
      { path: "admin/inactive/:id", element: <AlumniBatchPage /> },
      // Alumni and Old Users became the Admin page's Inactive Users tab
      { path: "alumni/*", element: <Navigate to="/admin?tab=inactive" replace /> },
      { path: "old-users", element: <Navigate to="/admin?tab=inactive" replace /> },

      {
        path: "roles/:id",
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <RolePage /> },
          { path: "members/:uid", element: <RoleMemberPage /> },
        ],
      },
    ],
  },
]);