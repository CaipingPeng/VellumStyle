import {useEffect, useRef, useState} from "react";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {flushDocumentThemeWrite, flushSave, useStore} from "../../store/index.ts";
import {flushBackgroundDocumentOperations} from "../../utils/backgroundDocumentUpdates.ts";
import {isTauriRuntime} from "../../utils/tauriEnv.ts";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

export default function SaveBeforeClose() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const attempt = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await flushBackgroundDocumentOperations();
      await flushSave();
      await flushDocumentThemeWrite();
      await getCurrentWindow().destroy();
    } catch (cause) {
      setError(String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void attemptRef.current();
    });
    return () => { void unlisten.then((dispose) => dispose()); };
  }, []);

  const saveAs = async () => {
    setBusy(true);
    try {
      const {currentDocPath, content} = useStore.getState();
      const {exportArticle} = await import("../../utils/exportArticle.ts");
      const result = await exportArticle("markdown", currentDocPath, {readMarkdownSource: () => content});
      if (result.status === "saved") setError("正文已另存为。可以继续编辑，或选择放弃未保存修改并关闭；排版配置可能仍未保存。");
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  return <Dialog open={error !== null} title="关闭前保存失败" onClose={() => setError(null)} closeDisabled={busy}
    footer={<>
      <Button variant="secondary" disabled={busy} onClick={() => setError(null)}>继续编辑</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void saveAs()}>正文另存为</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void getCurrentWindow().destroy()}>放弃修改并关闭</Button>
      <Button disabled={busy} onClick={() => void attempt()}>重试保存</Button>
    </>}>
    <p>未保存的内容仍保留在窗口中。请重试或另存为后再关闭。</p>
    <p role="alert" className="mt-2 break-words text-sm text-danger">{error}</p>
  </Dialog>;
}
