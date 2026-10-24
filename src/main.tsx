import React from "react";
import ReactDOM from "react-dom/client";
import AccountGate from "./components/Accounts/AccountGate.tsx";
import {profileStorage} from "./utils/profileStorage.ts";
import ErrorBoundary, {installGlobalErrorHandlers} from "./components/ErrorBoundary.tsx";
import "./styles/globals.css";
import {applyAppearanceMode, readPersistedAppearanceMode} from "./appearance/appearanceMode.ts";
import {applyColorScheme, readPersistedColorScheme} from "./appearance/colorScheme.ts";
import {applyBackgroundImage, readPersistedBackgroundImage} from "./appearance/backgroundImage.ts";

const initialAppearanceMode = readPersistedAppearanceMode(profileStorage());
applyAppearanceMode(initialAppearanceMode, document.documentElement);
const initialColorScheme = readPersistedColorScheme(profileStorage());
applyColorScheme(initialColorScheme, document.documentElement);
const initialBackgroundImage = readPersistedBackgroundImage(profileStorage());
applyBackgroundImage(initialBackgroundImage.path, initialBackgroundImage.blur, document.documentElement);

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AccountGate />
    </ErrorBoundary>
  </React.StrictMode>
);
