import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const mode = document.documentElement.dataset.mode === "options" ? "options" : "panel";
const params = new URLSearchParams(location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App mode={mode} welcome={params.get("welcome") === "1"} />
  </StrictMode>,
);
