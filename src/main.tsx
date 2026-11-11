import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initLocale } from "@/lib/locale";
import { initTheme } from "@/lib/theme";

initLocale();
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
