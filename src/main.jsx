import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import router from "@/routes";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProvider>
  </StrictMode>
);
