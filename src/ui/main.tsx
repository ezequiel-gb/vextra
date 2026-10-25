import { createRoot } from "react-dom/client";
import { loadSettings } from "../persistence/settings.ts";
import { App } from "./App.tsx";
import "./styles.css";
const settings = await loadSettings();
document.documentElement.dataset.theme =
  settings.theme === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : settings.theme;
createRoot(document.getElementById("root")!).render(
  <App initialSettings={settings} />,
);
