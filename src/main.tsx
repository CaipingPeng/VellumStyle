import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary, {installGlobalErrorHandlers} from "./components/ErrorBoundary.tsx";
import "./styles/globals.css";
import {applyAppearanceMode, readPersistedAppearanceMode} from "./appearance/appearanceMode.ts";
import {applyColorScheme, readPersistedColorScheme} from "./appearance/colorScheme.ts";
import {applyBackgroundImage, readPersistedBackgroundImage} from "./appearance/backgroundImage.ts";

const initialAppearanceMode = readPersistedAppearanceMode(window.localStorage);
applyAppearanceMode(initialAppearanceMode, document.documentElement);
const initialColorScheme = readPersistedColorScheme(window.localStorage);
applyColorScheme(initialColorScheme, document.documentElement);
const initialBackgroundImage = readPersistedBackgroundImage(window.localStorage);
applyBackgroundImage(initialBackgroundImage.path, initialBackgroundImage.blur, document.documentElement);

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
