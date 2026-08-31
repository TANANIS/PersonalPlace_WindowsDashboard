import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/today.css";
import "./styles/focus.css";
import "./styles/dashboard.css";
import "./styles/place.css";
import "./styles/todo.css";
import "./styles/support-workspaces.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
