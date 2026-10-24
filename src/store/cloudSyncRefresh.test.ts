import assert from "node:assert/strict";
import {after, test} from "node:test";
import {build} from "esbuild";
import {readFile, unlink, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {tempRuntimePath} from "../test/tempRuntime.ts";

const output = tempRuntimePath("sync-refresh");
let runtime: any;
async function load() {
  if (runtime) return runtime;
  const bundle = await build({
    stdin: {contents: 'export * from "./src/store/index.ts"; export {createDocument, writeDocument, readDocument, deleteEntry} from "./src/utils/documents.ts";', resolveDir: process.cwd(), loader: "ts"},
    bundle: true, write: false, format: "esm", platform: "browser", packages: "external",
    plugins: [{name: "sync-fixture", setup(b) {
      b.onLoad({filter: /src[\\/]themes[\\/]index\.ts$/}, async (args) => ({
        contents: (await readFile(args.path, "utf8")).replace('import.meta.glob(["./builtin/*.css", "!./builtin/ink-haze.css"], {\n  query: "?raw",\n  import: "default",\n})', "({})"), loader: "ts",
      }));
      b.onResolve({filter: /\.css\?raw$/}, (args) => ({path: args.path, namespace: "css-stub"}));
      b.onLoad({filter: /.*/, namespace: "css-stub"}, () => ({contents: "export default '';", loader: "js"}));
      b.onLoad({filter: /src[\\/]utils[\\/]cloudSync\.ts$/}, () => ({
        contents: "export const runCloudSync = () => globalThis.__syncFixture();", loader: "js",
      }));
    }}],
  });
  await writeFile(output, bundle.outputFiles[0].contents);
  runtime = await import(pathToFileURL(output).href);
  return runtime;
}
after(async () => { await unlink(output).catch(() => undefined); });
const summary = (extra = {}) => ({enabled: true, syncedAt: Date.now(), uploaded: 0, downloaded: 1, deletedLocal: 0, deletedRemote: 0, conflicts: 0, message: "同步完成", ...extra});

test("云端下载后刷新目录和已打开正文，同步期间继续输入时保留编辑内容", async () => {
  const r = await load();
  const path = await r.createDocument("", "同步文章");
  await r.writeDocument(path, "before");
  r.useStore.setState({currentDocPath: path, content: "before", documentThemeIds: {}, documentLayouts: {}});
  try {
    (globalThis as any).__syncFixture = async () => {
      await r.writeDocument(path, "remote update");
      return summary();
    };
    await r.flushCloudSync();
    assert.equal(r.useStore.getState().content, "remote update");
    assert.ok(r.useStore.getState().tree.some((node: any) => node.path === path));
    (globalThis as any).__syncFixture = async () => {
      r.useStore.getState().setContent("typing during sync");
      await r.writeDocument(path, "another remote update");
      return summary();
    };
    await r.flushCloudSync();
    assert.equal(r.useStore.getState().content, "typing during sync");
    await r.flushSave();
    assert.equal(await r.readDocument(path), "typing during sync");
  } finally {
    await r.suspendCloudSync(); r.resumeCloudSync();
    Reflect.deleteProperty(globalThis, "__syncFixture");
  }
});

test("云端删除当前文档后解除编辑绑定，避免后续自动保存重新创建旧文章", async () => {
  const r = await load();
  const path = await r.createDocument("", "云端删除");
  await r.writeDocument(path, "before");
  r.useStore.setState({currentDocPath: path, content: "before"});
  try {
    (globalThis as any).__syncFixture = async () => {
      await r.deleteEntry(path);
      return summary({downloaded: 0, deletedLocal: 1});
    };
    await r.flushCloudSync();
    assert.equal(r.useStore.getState().currentDocPath, null);
    assert.equal(r.useStore.getState().content, "");
  } finally {
    await r.suspendCloudSync(); r.resumeCloudSync();
    Reflect.deleteProperty(globalThis, "__syncFixture");
  }
});
