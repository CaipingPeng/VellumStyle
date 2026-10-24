import React from "react";
import ReactDOM from "react-dom/client";
import {initializeWechatAccounts} from "./utils/wechatAccounts.ts";
import {recoverSharedPreferences} from "./utils/accountStorage.ts";
import ErrorBoundary, {installGlobalErrorHandlers} from "./components/ErrorBoundary.tsx";
import "./styles/globals.css";
import {applyAppearanceMode, readPersistedAppearanceMode} from "./appearance/appearanceMode.ts";
import {applyColorScheme, readPersistedColorScheme} from "./appearance/colorScheme.ts";
import {applyBackgroundImage, readPersistedBackgroundImage} from "./appearance/backgroundImage.ts";

async function start() {
  try { recoverSharedPreferences(window.localStorage); } catch { /* unavailable storage */ }
  await initializeWechatAccounts().catch((error) => console.warn("读取公众号配置失败：", error));
  const {default: App} = await import("./App.tsx");
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
}
void start();
