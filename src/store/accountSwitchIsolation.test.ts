import assert from "node:assert/strict";
import {after, test} from "node:test";
import {build} from "esbuild";
import {readFile, unlink, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {tempRuntimePath} from "../test/tempRuntime.ts";

const output = tempRuntimePath("account-switch-isolation");
let runtime: any;
async function load() {
  if (runtime) return runtime;
  const bundle = await build({
    stdin: {
      contents: `
        export * from "./src/store/index.ts";
        export * from "./src/utils/wechatAccounts.ts";
        export {createDocument, writeDocument, readDocument} from "./src/utils/documents.ts";
      `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    packages: "external",
    plugins: [
      {
        name: "switch-fixture",
        setup(b) {
          b.onLoad({filter: /src[\\/]themes[\\/]index\.ts$/}, async (args) => ({
            contents: (await readFile(args.path, "utf8")).replace(
              'import.meta.glob(["./builtin/*.css", "!./builtin/ink-haze.css"], {\n  query: "?raw",\n  import: "default",\n})',
              "({})",
            ),
            loader: "ts",
          }));
          b.onResolve({filter: /\.css\?raw$/}, (args) => ({path: args.path, namespace: "css-stub"}));
          b.onLoad({filter: /.*/, namespace: "css-stub"}, () => ({contents: "export default '';", loader: "js"}));
          b.onLoad({filter: /src[\\/]utils[\\/]cloudSync\.ts$/}, () => ({
            contents: "export const runCloudSync = async () => ({enabled: false, syncedAt: null, uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, message: ''});",
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(output, bundle.outputFiles[0].contents);
  runtime = await import(pathToFileURL(output).href);
  return runtime;
}

after(async () => {
  await unlink(output).catch(() => undefined);
});

test("switching accounts isolates article tree and flushes pending edits", async () => {
  const r = await load();

  // Mock per-account backend storage
  const accountFiles = new Map<string, Map<string, string>>();
  accountFiles.set("wxA", new Map());
  accountFiles.set("wxB", new Map());
  let currentActive = "wxA";

  const getMap = () => accountFiles.get(currentActive)!;

  const internals = {
    transformCallback: () => 0,
    invoke: async (cmd: string, args?: Record<string, any>) => {
      if (cmd === "list_wechat_accounts") {
        return {
          accounts: [{name: "Account A", app_id: "wxA"}, {name: "Account B", app_id: "wxB"}],
          active_app_id: currentActive,
        };
      }
      if (cmd === "switch_wechat_account") {
        currentActive = args?.appId;
        return {
          accounts: [{name: "Account A", app_id: "wxA"}, {name: "Account B", app_id: "wxB"}],
          active_app_id: currentActive,
        };
      }
      if (cmd === "list_documents") {
        const map = getMap();
        return Array.from(map.keys()).map((name) => ({
          name,
          path: name,
          is_dir: false,
          children: [],
        }));
      }
      if (cmd === "create_document") {
        const full = `${args?.name}.md`;
        getMap().set(full, "");
        return full;
      }
      if (cmd === "write_document") {
        getMap().set(args?.path, args?.text ?? args?.content ?? "");
        return undefined;
      }
      if (cmd === "read_document") {
        return getMap().get(args?.path) ?? "";
      }
      return undefined;
    },
  };

  const win = window as any;
  const glob = globalThis as any;
  const prevWinInternals = win.__TAURI_INTERNALS__;
  const prevGlobInternals = glob.__TAURI_INTERNALS__;
  win.__TAURI_INTERNALS__ = internals;
  glob.__TAURI_INTERNALS__ = internals;
  try {
    await r.initializeWechatAccounts();
    await r.useStore.getState().loadTree();

    // 1. In Account A, create an article and edit content
    const docA = await r.createDocument("", "Article_A");
    await r.useStore.getState().loadTree();
    await r.useStore.getState().openDocument(docA);
    r.useStore.getState().setContent("Content in Account A");

    assert.equal(r.useStore.getState().tree.some((n: any) => n.path === "Article_A.md"), true);

    // 2. Switch to Account B
        await r.switchWechatAccount("wxB");

    // Account A's edits should have been flushed to Account A's storage
    assert.equal(accountFiles.get("wxA")?.get("Article_A.md"), "Content in Account A");

    // In Account B, the article tree must NOT contain Article_A!
    const treeB = r.useStore.getState().tree;
    assert.equal(treeB.some((n: any) => n.path === "Article_A.md"), false, "Account A's article must disappear in Account B");
    assert.equal(r.useStore.getState().currentDocPath, null);
    assert.equal(r.useStore.getState().content, "");

    // 3. Create an article in Account B
    const docB = await r.createDocument("", "Article_B");
    await r.useStore.getState().loadTree();
    await r.useStore.getState().openDocument(docB);
    r.useStore.getState().setContent("Content in Account B");

    // 4. Switch back to Account A
    await r.switchWechatAccount("wxA");

    // In Account A, Article_A is present and Article_B must NOT be present!
    const treeA = r.useStore.getState().tree;
    assert.equal(treeA.some((n: any) => n.path === "Article_A.md"), true);
    assert.equal(treeA.some((n: any) => n.path === "Article_B.md"), false, "Account B's article must not bleed into Account A");
    // And it remembered last opened doc in Account A!
    assert.equal(r.useStore.getState().currentDocPath, "Article_A.md");
    assert.equal(r.useStore.getState().content, "Content in Account A");
  } finally {
    win.__TAURI_INTERNALS__ = prevWinInternals;
    glob.__TAURI_INTERNALS__ = prevGlobInternals;
  }
});
