import {lazy, Suspense, useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {activateUser, profileStorage, type LocalUser} from "../../utils/profileStorage.ts";
import {isTauriRuntime} from "../../utils/tauriEnv.ts";
import {applyAppearanceMode, readPersistedAppearanceMode} from "../../appearance/appearanceMode.ts";
import {applyColorScheme, readPersistedColorScheme} from "../../appearance/colorScheme.ts";
import {applyBackgroundImage, readPersistedBackgroundImage} from "../../appearance/backgroundImage.ts";

// Importing App initializes the store. Delay that until authentication and storage migration.
const App = lazy(() => import("../../App.tsx"));

export default function AccountGate() {
  const desktop = isTauriRuntime();
  const [ready, setReady] = useState(!desktop);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const enter = async (user: LocalUser) => {
    activateUser(user);
    const storage = profileStorage();
    if (user.ownsLegacyData) {
      const dir = await invoke<string>("get_user_data_dir");
      const raw = storage.getItem("vellumstyle");
      if (raw) {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
        const path = parsed.state?.backgroundImagePath;
        if (typeof path === "string" && /[/\\]backgrounds[/\\]/.test(path)) {
          parsed.state.backgroundImagePath = `${dir}/backgrounds/${path.split(/[/\\]/).pop()}`;
          storage.setItem("vellumstyle", JSON.stringify(parsed));
        }
      }
    }
    applyAppearanceMode(readPersistedAppearanceMode(storage), document.documentElement);
    applyColorScheme(readPersistedColorScheme(storage), document.documentElement);
    const bg = readPersistedBackgroundImage(storage);
    applyBackgroundImage(bg.path, bg.blur, document.documentElement);
    setPassword(""); setConfirm("");
    setReady(true);
  };
  const load = async () => {
    setError("");
    try {
      const current = await invoke<LocalUser | null>("get_current_user");
      if (current) { await enter(current); return; }
      const list = await invoke<LocalUser[]>("list_local_users");
      setUsers(list); setSelected(list[0]?.id ?? ""); setCreating(list.length === 0); setLoaded(true);
    } catch (cause) { setError(String(cause)); }
  };
  useEffect(() => { if (desktop) void load(); }, [desktop]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    if (creating && password !== confirm) { setError("两次输入的密码不一致"); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      let id = selected;
      if (creating) {
        const user = await invoke<LocalUser>("create_local_user", {name, password});
        id = user.id;
        setUsers((list) => [...list, user]); setSelected(id); setCreating(false);
      }
      await enter(await invoke<LocalUser>("login_local_user", {id, password}));
    } catch (cause) { setError(String(cause)); }
    finally { submitting.current = false; setBusy(false); }
  };

  if (ready) return <Suspense fallback={<p className="p-8 text-text">正在打开工作区…</p>}><App /></Suspense>;
  const input = "h-11 w-full rounded border border-border bg-bg px-3 text-text outline-none focus:border-accent focus:ring-2 focus:ring-[color:var(--ring)]";
  return <main className="flex min-h-screen items-center justify-center bg-bg-secondary p-8 text-text">
    <section className="w-full max-w-md rounded-xl border border-border bg-bg p-8 shadow-lg">
      <h1 className="text-2xl font-semibold">文澜排版</h1>
      <p className="mb-6 mt-2 text-sm text-text-secondary">{creating ? "创建本机账户" : "登录本机账户"}</p>
      {!loaded ? <><p role="status">正在读取用户列表…</p><button className="mt-4 text-accent" onClick={() => void load()}>重新读取</button></> :
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {creating ? <label className="block text-sm">用户名<input className={`${input} mt-2`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" maxLength={32} required /></label> :
              <label className="block text-sm">账户<select className={`${input} mt-2`} value={selected} onChange={(e) => {setSelected(e.target.value); setPassword(""); setError("");}}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
            <label className="block text-sm">密码<input className={`${input} mt-2`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 8 : undefined} maxLength={128} required /></label>
            {creating && <label className="block text-sm">确认密码<input className={`${input} mt-2`} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>}
            {creating && <p className="text-xs leading-relaxed text-text-muted">密码至少 8 位。{users.length === 0 ? "现有文章和配置将迁入此账户。" : "新账户拥有独立的文章、设置和微信会话。"}本机账户没有在线密码找回功能。</p>}
            <button type="submit" className="h-11 w-full rounded bg-accent font-medium text-white disabled:opacity-60">{busy ? "正在处理…" : creating ? "创建并登录" : "登录"}</button>
          </fieldset>
          {users.length > 0 && <button type="button" disabled={busy} className="text-sm text-accent" onClick={() => {setCreating(!creating); setPassword(""); setConfirm(""); setError("");}}>{creating ? "返回登录" : "创建新账户"}</button>}
        </form>}
      {error && <p role="alert" className="mt-4 break-words text-sm text-danger">{error}</p>}
    </section>
  </main>;
}
