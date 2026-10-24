import {useRef, useState} from "react";
import {createPortal} from "react-dom";
import {relaunch} from "@tauri-apps/plugin-process";
import {getActiveUser} from "../../utils/profileStorage.ts";
import Button from "../ui/Button.tsx";

export default function AccountPanel() {
  const user = getActiveUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const switchUser = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    const store = await import("../../store/index.ts");
    try {
      const {imageUploadTasks} = await import("../../utils/imageUploadTasks.ts");
      if (imageUploadTasks.getSnapshot().some((task) => task.status === "active")) {
        throw new Error("请等待图片上传完成后切换账户");
      }
      await store.suspendCloudSync();
      const {flushBackgroundDocumentOperations} = await import("../../utils/backgroundDocumentUpdates.ts");
      await flushBackgroundDocumentOperations();
      await store.flushSave();
      await store.flushDocumentThemeWrite();
      // Flush debounced preferences using the same event as a normal application exit.
      window.dispatchEvent(new Event("pagehide"));
      await relaunch();
    } catch (cause) { store.resumeCloudSync(); store.scheduleCloudSync(); setError(String(cause)); }
    finally { running.current = false; setBusy(false); }
  };
  return <div className="space-y-4 text-sm text-text">
    <h2 className="text-base font-semibold">本机账户</h2>
    <p>{user ? `当前账户：${user.name}` : "网页预览不支持本机账户，请使用桌面版。"}</p>
    <p className="leading-relaxed text-text-secondary">每个账户分别保存文章、版本历史、最近删除、模板、主题、外观设置、微信登录和同步配置。</p>
    {user && <><p className="leading-relaxed text-text-secondary">切换账户会保存当前工作并重启到登录页。你可以登录其他账户，也可以创建新账户。</p>
      <Button disabled={busy} onClick={() => void switchUser()}>保存并切换账户</Button></>}
    <p className="text-xs leading-relaxed text-text-muted">账户隔离适用于本应用。数据保存在当前操作系统用户目录中，拥有该目录访问权限的人仍可通过文件管理器读取文件。</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {busy && createPortal(<div role="alertdialog" aria-label="正在切换账户" aria-modal="true" tabIndex={-1}
      ref={(node) => node?.focus()} onKeyDownCapture={(event) => {event.preventDefault(); event.stopPropagation();}}
      className="fixed inset-0 z-[9999] grid place-items-center bg-bg text-text"><p>正在保存工作并切换账户，请稍候…</p></div>, document.body)}
  </div>;
}
