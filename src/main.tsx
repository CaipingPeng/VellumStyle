import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles/globals.css";
import {applyAppearanceMode, readPersistedAppearanceMode} from "./appearance/appearanceMode.ts";

const initialAppearanceMode = readPersistedAppearanceMode(window.localStorage);
applyAppearanceMode(initialAppearanceMode, document.documentElement);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
