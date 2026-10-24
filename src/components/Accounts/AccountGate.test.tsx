import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {build} from "esbuild";
import {writeFile, unlink} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {tempRuntimePath} from "../../test/tempRuntime.ts";

test("登录前不加载编辑器和旧草稿；密码错误留在登录页，成功后才初始化用户工作区", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const output = tempRuntimePath("account-gate");
  const built = await build({
    stdin: {contents: 'export {default} from "./src/components/Accounts/AccountGate.tsx";', resolveDir: process.cwd(), loader: "tsx"},
    bundle: true, write: false, format: "esm", platform: "browser", packages: "external",
    plugins: [{name: "isolated-editor", setup(b) {
      b.onResolve({filter: /App\.tsx$/}, () => ({path: "App", namespace: "fixture"}));
      b.onLoad({filter: /.*/, namespace: "fixture"}, () => ({contents: `
        import {createElement} from "react";
        import {getActiveUser} from "./src/utils/profileStorage.ts";
        globalThis.__accountAppLoaded = true;
        export default function App() { return createElement("p", {id: "editor-fixture"}, getActiveUser()?.name); }
      `, loader: "js", resolveDir: process.cwd()}));
    }}],
  });
  await writeFile(output, built.outputFiles[0].contents);
  const values = new Map<string, string>([["vellumstyle", "private legacy draft"]]);
  const storage: Storage = {
    get length() {return values.size;}, key(i) {return [...values.keys()][i] ?? null;},
    getItem(k) {return values.get(k) ?? null;}, setItem(k,v) {values.set(k,v);}, removeItem(k) {values.delete(k);}, clear() {values.clear();},
  };
  let loginCalls = 0;
  let allowLogin = false;
  const fixture = {id: "bob", name: "Bob", ownsLegacyData: false};
  const mock = {invoke(command: string) {
    if (command === "get_current_user") return Promise.resolve(null);
    if (command === "list_local_users") return Promise.resolve([fixture]);
    if (command === "login_local_user") {loginCalls++; return allowLogin ? Promise.resolve(fixture) : Promise.reject("密码不正确");}
    return Promise.reject(`unexpected command ${command}`);
  }};
  const prevGlobal = Object.getOwnPropertyDescriptor(globalThis, "__TAURI_INTERNALS__");
  const prevWindow = Object.getOwnPropertyDescriptor(window, "__TAURI_INTERNALS__");
  const prevStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {configurable: true, value: mock});
  Object.defineProperty(window, "__TAURI_INTERNALS__", {configurable: true, value: mock});
  Object.defineProperty(window, "localStorage", {configurable: true, value: storage});
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const {default: Gate} = await import(pathToFileURL(output).href);
    await act(async () => {root.render(<Gate />);});
    assert.equal((globalThis as any).__accountAppLoaded, undefined);
    assert.equal(host.querySelector("#editor-fixture"), null);
    assert.ok(!host.textContent?.includes("private legacy draft"));
    const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {setValue.call(input, "password123"); input.dispatchEvent(new window.Event("input", {bubbles: true}));});
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new window.Event("submit", {bubbles: true, cancelable: true}));
      host.querySelector("form")!.dispatchEvent(new window.Event("submit", {bubbles: true, cancelable: true}));
    });
    assert.equal(loginCalls, 1);
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /密码不正确/);
    assert.equal((globalThis as any).__accountAppLoaded, undefined);
    allowLogin = true;
    await act(async () => {host.querySelector("form")!.dispatchEvent(new window.Event("submit", {bubbles: true, cancelable: true}));});
    assert.equal(loginCalls, 2);
    assert.equal((globalThis as any).__accountAppLoaded, true);
    assert.equal(host.querySelector("#editor-fixture")?.textContent, "Bob");
    assert.equal(storage.getItem("vellumstyle.user.bob.vellumstyle"), null);
  } finally {
    act(() => root.unmount()); host.remove();
    for (const [target, key, descriptor] of [[globalThis, "__TAURI_INTERNALS__", prevGlobal], [window, "__TAURI_INTERNALS__", prevWindow], [window, "localStorage", prevStorage]] as const) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
    }
    Reflect.deleteProperty(globalThis, "__accountAppLoaded");
    await unlink(output);
  }
});
