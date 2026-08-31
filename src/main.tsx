import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/shell.css";
import "./styles/today.css";
import "./styles/dashboard.css";
import "./styles/place.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
