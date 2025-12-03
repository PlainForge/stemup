import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./Routes";
import './index.css'
import MainProvider from "./context/MainProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MainProvider>
        <RouterProvider router={router} />
    </MainProvider>
  </React.StrictMode>
);