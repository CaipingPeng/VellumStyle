# 多文档管理 + 一键发布草稿箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给文澜排版加文件系统映射的多文档管理（树状）、一键发布到公众号草稿箱、撤销/重做按钮、轻量 toast。

**Architecture:** 文件系统是文档内容的唯一真相源（`app_data_dir/documents/` 目录树），store 只缓存当前一篇 content + 整棵树结构；编辑 debounce 800ms 写盘，切换/关窗前主动 flush。发布走微信 `draft/add`，封面独立 `upload_thumb` 拿 media_id。

**Tech Stack:** Rust (Tauri 2, reqwest) / React 18 + Zustand / CodeMirror 6 / node:test + tsx 单测。

参考 spec：`docs/superpowers/specs/2026-06-08-multi-doc-and-publish-design.md`

---

## 文件结构

**新建：**
- `src-tauri/src/documents.rs` — 文档树 Rust 命令（list/read/write/create/rename/delete + 沙箱校验）
- `src/utils/documents.ts` — 前端封装 invoke 文档命令 + DocNode 类型
- `src/utils/autosave.ts` — 模块级 debounce flush helper（纯函数计时决策可测）
- `src/utils/autosave.test.ts` — flush 计时决策单测
- `src/components/DocTree/DocTree.tsx` — 侧栏容器
- `src/components/DocTree/TreeNode.tsx` — 递归树节点
- `src/components/DocTree/useDocActions.ts` — create/rename/delete + loadTree 封装
- `src/components/Toast/toast.ts` — 模块级 toast 单例
- `src/components/Toast/Toaster.tsx` — 右下角渲染容器
- `src/components/Publish/PublishButton.tsx` — 发布按钮
- `src/components/Publish/PublishDialog.tsx` — 发布弹窗（标题+封面）
- `src/utils/publish.ts` — invoke upload_thumb / add_draft + 外链图校验

**修改：**
- `src-tauri/src/lib.rs` — 注册 documents + 发布命令
- `src-tauri/src/wechat.rs` — 加 upload_thumb / add_draft
- `src/store/index.ts` — tree/currentDocPath/openDocument/loadTree，partialize 改 currentDocPath
- `src/App.tsx` — 三栏布局、启动加载/迁移、挂 Toaster、关窗 flush、alert→toast
- `src/components/Editor/MarkdownEditor.tsx` — 暴露 undo()/redo()
- `src/components/Toolbar/SyntaxToolbar.tsx` — 最左加撤销/重做按钮

---

## Task 1: Rust 沙箱校验 + 文档树命令

**Files:**
- Create: `src-tauri/src/documents.rs`
- Modify: `src-tauri/src/lib.rs:1-4`（加 `mod documents;`）、`src-tauri/src/lib.rs:62-77`（注册命令）

- [ ] **Step 1: 写 documents.rs**

```rust
// 文档树：app_data_dir/documents/ 是唯一真相源。文件夹=树节点，.md=文档。
// 所有路径参数 = 相对 documents/ 的相对路径；沙箱校验防 ../ 逃逸。

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct DocNode {
    pub name: String,
    pub path: String, // 相对 documents/ 的路径，正斜杠分隔
    pub is_dir: bool,
    pub children: Vec<DocNode>,
}

fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?
        .join("documents");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建文档目录失败：{e}"))?;
    Ok(dir)
}

// 名称非法字符过滤（Windows 文件名约束 + 路径分隔符）。
fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        && name != "."
        && name != ".."
}

// 把相对路径解析为 documents/ 下的绝对路径，校验不逃逸。
// 用逐段拼接（不依赖文件存在，create 场景目标尚不存在），拒绝 .. 与绝对段。
fn resolve_in_documents(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let base = documents_dir(app)?;
    let mut full = base.clone();
    for seg in rel.split(['/', '\\']) {
        if seg.is_empty() {
            continue;
        }
        if seg == ".." || seg == "." {
            return Err("非法路径".into());
        }
        full.push(seg);
    }
    // 二次保险：规范化后仍须在 base 内（base 已存在可 canonicalize）。
    let canon_base = std::fs::canonicalize(&base).map_err(|e| format!("{e}"))?;
    if let Ok(canon_full) = std::fs::canonicalize(&full) {
        if !canon_full.starts_with(&canon_base) {
            return Err("非法路径".into());
        }
    }
    Ok(full)
}

fn rel_path(base: &Path, full: &Path) -> String {
    full.strip_prefix(base)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

fn scan(dir: &Path, base: &Path) -> Vec<DocNode> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<DocNode> = Vec::new();
    let mut files: Vec<DocNode> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            dirs.push(DocNode {
                name,
                path: rel_path(base, &path),
                is_dir: true,
                children: scan(&path, base),
            });
        } else {
            let is_md = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md"))
                .unwrap_or(false);
            if !is_md {
                continue;
            }
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            files.push(DocNode {
                name,
                path: rel_path(base, &path),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    files.sort_by(|a, b| a.name.cmp(&b.name));
    dirs.into_iter().chain(files).collect()
}

#[tauri::command]
pub fn list_documents(app: AppHandle) -> Result<Vec<DocNode>, String> {
    let base = documents_dir(&app)?;
    Ok(scan(&base, &base))
}

#[tauri::command]
pub fn read_document(app: AppHandle, path: String) -> Result<String, String> {
    let full = resolve_in_documents(&app, &path)?;
    std::fs::read_to_string(&full).map_err(|e| format!("读取文档失败：{e}"))
}

#[tauri::command]
pub fn write_document(app: AppHandle, path: String, text: String) -> Result<(), String> {
    let full = resolve_in_documents(&app, &path)?;
    std::fs::write(&full, text).map_err(|e| format!("写入文档失败：{e}"))
}

#[tauri::command]
pub fn create_document(app: AppHandle, dir: String, name: String) -> Result<String, String> {
    if !is_valid_name(&name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let parent = resolve_in_documents(&app, &dir)?;
    std::fs::create_dir_all(&parent).map_err(|e| format!("{e}"))?;
    let full = parent.join(format!("{name}.md"));
    if full.exists() {
        return Err("已存在同名文档".into());
    }
    std::fs::write(&full, "").map_err(|e| format!("创建文档失败：{e}"))?;
    Ok(rel_path(&base, &full))
}

#[tauri::command]
pub fn create_folder(app: AppHandle, dir: String, name: String) -> Result<String, String> {
    if !is_valid_name(&name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let parent = resolve_in_documents(&app, &dir)?;
    let full = parent.join(&name);
    if full.exists() {
        return Err("已存在同名文件夹".into());
    }
    std::fs::create_dir_all(&full).map_err(|e| format!("创建文件夹失败：{e}"))?;
    Ok(rel_path(&base, &full))
}

#[tauri::command]
pub fn rename_entry(app: AppHandle, path: String, new_name: String) -> Result<String, String> {
    if !is_valid_name(&new_name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let full = resolve_in_documents(&app, &path)?;
    if !full.exists() {
        return Err("条目不存在".into());
    }
    let is_dir = full.is_dir();
    let parent = full.parent().ok_or_else(|| "无父目录".to_string())?;
    let target = if is_dir {
        parent.join(&new_name)
    } else {
        parent.join(format!("{new_name}.md"))
    };
    if target.exists() {
        return Err("目标名已存在".into());
    }
    std::fs::rename(&full, &target).map_err(|e| format!("重命名失败：{e}"))?;
    Ok(rel_path(&base, &target))
}

#[tauri::command]
pub fn delete_entry(app: AppHandle, path: String) -> Result<(), String> {
    let full = resolve_in_documents(&app, &path)?;
    if !full.exists() {
        return Err("条目不存在".into());
    }
    if full.is_dir() {
        let empty = std::fs::read_dir(&full)
            .map(|mut e| e.next().is_none())
            .unwrap_or(false);
        if !empty {
            return Err("文件夹非空，请先清空".into());
        }
        std::fs::remove_dir(&full).map_err(|e| format!("删除失败：{e}"))
    } else {
        std::fs::remove_file(&full).map_err(|e| format!("删除失败：{e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::is_valid_name;

    #[test]
    fn rejects_path_separators_and_dotdot() {
        assert!(!is_valid_name(""));
        assert!(!is_valid_name(".."));
        assert!(!is_valid_name("a/b"));
        assert!(!is_valid_name("a\\b"));
        assert!(!is_valid_name("a:b"));
        assert!(is_valid_name("周报"));
        assert!(is_valid_name("2026-周报_v1"));
    }
}
```

- [ ] **Step 2: 在 lib.rs 注册模块**

`src-tauri/src/lib.rs` 顶部 mod 区（第 1-4 行）加一行：
```rust
mod config;
mod documents;
mod import;
mod themes;
mod wechat;
```

invoke_handler 列表（在 `themes::open_themes_dir` 后加逗号续上）：
```rust
            themes::open_themes_dir,
            documents::list_documents,
            documents::read_document,
            documents::write_document,
            documents::create_document,
            documents::create_folder,
            documents::rename_entry,
            documents::delete_entry
```

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo build`
Expected: 编译通过（含 is_valid_name 单测可被 `cargo test` 跑）。

- [ ] **Step 4: Rust 单测**

Run: `cd src-tauri && cargo test documents`
Expected: `rejects_path_separators_and_dotdot` PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/documents.rs src-tauri/src/lib.rs
git commit -m "feat: add document tree Rust commands with path sandboxing"
```

---

## Task 2: 前端文档命令封装

**Files:**
- Create: `src/utils/documents.ts`

- [ ] **Step 1: 写 documents.ts**

```ts
// 前端封装文档树 Tauri 命令。DocNode 与 Rust documents.rs 同构。
import {invoke} from "@tauri-apps/api/core";

export interface DocNode {
  name: string;
  path: string; // 相对 documents/ 的路径
  isDir: boolean;
  children: DocNode[];
}

// Rust 返回 snake_case is_dir，Tauri serde 默认不改名，这里手动归一。
interface RawDocNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: RawDocNode[];
}

function normalize(node: RawDocNode): DocNode {
  return {
    name: node.name,
    path: node.path,
    isDir: node.is_dir,
    children: node.children.map(normalize),
  };
}

export async function listDocuments(): Promise<DocNode[]> {
  const raw = await invoke<RawDocNode[]>("list_documents");
  return raw.map(normalize);
}

export function readDocument(path: string): Promise<string> {
  return invoke<string>("read_document", {path});
}

export function writeDocument(path: string, text: string): Promise<void> {
  return invoke("write_document", {path, text});
}

export function createDocument(dir: string, name: string): Promise<string> {
  return invoke<string>("create_document", {dir, name});
}

export function createFolder(dir: string, name: string): Promise<string> {
  return invoke<string>("create_folder", {dir, name});
}

export function renameEntry(path: string, newName: string): Promise<string> {
  return invoke<string>("rename_entry", {path, newName});
}

export function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", {path});
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/utils/documents.ts
git commit -m "feat: add frontend document command wrappers"
```

---

## Task 3: 轻量 toast

**Files:**
- Create: `src/components/Toast/toast.ts`, `src/components/Toast/Toaster.tsx`

- [ ] **Step 1: 写 toast.ts（模块级单例）**

```ts
// 模块级 toast 单例：组件外可直接 toast.show(...)，Toaster 订阅渲染。
export type ToastType = "info" | "error";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l([...items]);
}

export const toast = {
  show(message: string, type: ToastType = "info", duration = 2500) {
    const id = nextId++;
    items = [...items, {id, message, type}];
    emit();
    window.setTimeout(() => {
      items = items.filter((it) => it.id !== id);
      emit();
    }, duration);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    l([...items]);
    return () => listeners.delete(l);
  },
};
```

- [ ] **Step 2: 写 Toaster.tsx**

```tsx
import {useEffect, useState} from "react";
import {toast, type ToastItem} from "./toast.ts";

// 固定右下角堆叠显示。挂在 App 根，订阅 toast 单例。
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 40,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 6,
            background: "rgba(40,40,40,0.92)",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            borderLeft: it.type === "error" ? "3px solid #e54545" : "3px solid #07c160",
          }}
        >
          {it.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/components/Toast/toast.ts src/components/Toast/Toaster.tsx
git commit -m "feat: add lightweight toast notification"
```

---

## Task 4: 自动保存 debounce helper（含单测）

**Files:**
- Create: `src/utils/autosave.ts`, `src/utils/autosave.test.ts`

- [ ] **Step 1: 写失败测试 autosave.test.ts**

```ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {createDebouncedSaver} from "./autosave.ts";

test("停顿后才触发 flush", async () => {
  let saved = "";
  const saver = createDebouncedSaver((text) => {
    saved = text;
  }, 50);
  saver.schedule("a");
  saver.schedule("ab");
  assert.equal(saved, "", "debounce 期间不应保存");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(saved, "ab", "停顿后保存最后值");
});

test("flushNow 立即保存并取消计时", async () => {
  let count = 0;
  let saved = "";
  const saver = createDebouncedSaver((text) => {
    count++;
    saved = text;
  }, 50);
  saver.schedule("x");
  await saver.flushNow();
  assert.equal(saved, "x");
  assert.equal(count, 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(count, 1, "flushNow 后原计时不应再触发");
});

test("无 pending 时 flushNow 不保存", async () => {
  let count = 0;
  const saver = createDebouncedSaver(() => {
    count++;
  }, 50);
  await saver.flushNow();
  assert.equal(count, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --import tsx --test src/utils/autosave.test.ts`
Expected: FAIL（createDebouncedSaver 未定义）。

- [ ] **Step 3: 写 autosave.ts**

```ts
// debounce 自动保存：schedule 重置计时，到点 flush；flushNow 立即 flush 并取消计时。
// 取纯逻辑（计时决策 + pending 标记）便于单测，不耦合 store/CodeMirror。

export interface DebouncedSaver {
  schedule(text: string): void;
  flushNow(): Promise<void>;
}

export function createDebouncedSaver(
  save: (text: string) => void | Promise<void>,
  delayMs: number,
): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  async function doFlush() {
    if (pending === null) return;
    const text = pending;
    pending = null;
    await save(text);
  }

  return {
    schedule(text: string) {
      pending = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void doFlush();
      }, delayMs);
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await doFlush();
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --import tsx --test src/utils/autosave.test.ts`
Expected: 3 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/autosave.ts src/utils/autosave.test.ts
git commit -m "feat: add debounced autosave helper with tests"
```

---

## Task 5: store 改造（多文档状态 + 自动保存接线）

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 改 store**

在 `src/store/index.ts` 顶部加 import：
```ts
import {listDocuments, readDocument, writeDocument, type DocNode} from "../utils/documents.ts";
import {createDebouncedSaver} from "../utils/autosave.ts";
```

`EditorState` 接口加字段（在 content 后）：
```ts
  tree: DocNode[];
  currentDocPath: string | null;
  loadTree: () => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  setCurrentDocPath: (path: string | null) => void;
```

在 `create(...)` 的 `persist` 工厂函数体之前（模块顶层、create 之后无所谓，放 create 之前）声明 saver——它要引用 useStore.getState，所以放在 useStore 定义**之后**。先在 store initial state 里加：
```ts
      tree: [],
      currentDocPath: null,
```

`setContent` 改为调用 saver（注意 saver 在下方定义，用函数引用延迟）：
```ts
      setContent: (content) => {
        set({content});
        scheduleSave(content);
      },
```

加新动作：
```ts
      setCurrentDocPath: (currentDocPath) => set({currentDocPath}),
      loadTree: async () => {
        const tree = await listDocuments();
        set({tree});
      },
      openDocument: async (path) => {
        // 先把当前篇落盘（必须 await，否则旧文档未保存编辑会丢）。
        await flushSave();
        const text = await readDocument(path);
        set({currentDocPath: path, content: text, selectedModelId: null});
      },
```

`partialize` 改为：
```ts
      partialize: (s) => ({
        currentDocPath: s.currentDocPath,
        markdownThemeId: s.markdownThemeId,
      }),
```

在 `useStore` 定义**之后**、文件末尾加 saver 与导出：
```ts
// 自动保存器：写当前文档到磁盘。debounce 800ms；切换/关窗前调 flushSave。
const saver = createDebouncedSaver(async (text) => {
  const path = useStore.getState().currentDocPath;
  if (path) await writeDocument(path, text);
}, 800);

export function scheduleSave(text: string) {
  saver.schedule(text);
}

export function flushSave(): Promise<void> {
  return saver.flushNow();
}
```

把 `setContent` 里用到的 `scheduleSave` 引用问题解决：因 `scheduleSave` 在 store 之后定义，而 setContent 在 store 内闭包引用它——JS 函数提升不覆盖 const。改为在 setContent 内**直接调用 saver 的封装**会有时序问题。**正确做法**：setContent 内调用一个模块级转发函数，该函数在 saver 初始化前调用是 no-op 风险。最简方案——把 saver 提到 store 定义**之前**，但 saver 回调用 `useStore.getState()`，getState 在 useStore 赋值后才可用；回调是延迟执行（debounce 到点才跑），届时 useStore 已就绪，所以**把 saver 声明移到 useStore 之前是安全的**：

最终顺序（覆盖前面，以此为准）：
```ts
// 1. 先声明 saver（回调延迟执行，届时 useStore 已定义）
const saver = createDebouncedSaver(async (text) => {
  const path = useStore.getState().currentDocPath;
  if (path) await writeDocument(path, text);
}, 800);

export function scheduleSave(text: string) {
  saver.schedule(text);
}
export function flushSave(): Promise<void> {
  return saver.flushNow();
}

// 2. 再 create useStore，setContent 调 scheduleSave
export const useStore = create<EditorState>()(persist(/* ... */));
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: 现有测试回归**

Run: `npm test`
Expected: 全部 PASS（store 无独立测试，确认未破坏其它）。

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add multi-doc state and autosave wiring to store"
```

---

## Task 6: MarkdownEditor 暴露 undo/redo

**Files:**
- Modify: `src/components/Editor/MarkdownEditor.tsx`

- [ ] **Step 1: 加 import 与方法**

`src/components/Editor/MarkdownEditor.tsx` 顶部加：
```ts
import {undo, redo} from "@codemirror/commands";
```

`MarkdownEditorHandle` 接口加：
```ts
  undo: () => void;
  redo: () => void;
```

`useImperativeHandle` 返回对象里（`scrollToLine` 后）加：
```ts
      undo: () => {
        const view = cmRef.current?.view;
        if (!view) return;
        undo(view);
        view.focus();
      },
      redo: () => {
        const view = cmRef.current?.view;
        if (!view) return;
        redo(view);
        view.focus();
      },
```

- [ ] **Step 2: 确认 @codemirror/commands 可用**

Run: `npx tsc -b --noEmit`
Expected: 零错误（codemirror 6 全家桶已含 @codemirror/commands，basicSetup 依赖它）。若报缺模块，`npm i @codemirror/commands` 后重试。

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor/MarkdownEditor.tsx
git commit -m "feat: expose undo/redo on markdown editor handle"
```

---

## Task 7: SyntaxToolbar 加撤销/重做按钮

**Files:**
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`

- [ ] **Step 1: 读现状确认 props**

先 Read `src/components/Toolbar/SyntaxToolbar.tsx`，确认它已收 `editorRef`（App.tsx 传的是 `editorRef={editorRef}`，类型 `RefObject<MarkdownEditorHandle>`）。

- [ ] **Step 2: 加按钮**

在 import 区把图标加上（与现有 lucide 图标同行）：
```ts
import {Undo2, Redo2} from "lucide-react";
```

在工具栏按钮组**最前面**（第一个语法按钮之前）插入两个按钮，复用该文件现有按钮样式/组件（若文件用 `<IconBtn>` 包装则照搬，否则用相同 `<button>` 样式）：
```tsx
      <button
        type="button"
        title="撤销 (Ctrl+Z)"
        onClick={() => editorRef.current?.undo()}
        style={iconBtnStyle}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        title="重做 (Ctrl+Y)"
        onClick={() => editorRef.current?.redo()}
        style={iconBtnStyle}
      >
        <Redo2 size={16} />
      </button>
```
> 注：`iconBtnStyle` 用该文件已有的按钮样式变量；若现有按钮是内联写法，复制其内联 style 对象。保持与现有图标按钮一致。

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/SyntaxToolbar.tsx
git commit -m "feat: add undo/redo buttons to syntax toolbar"
```

---

## Task 8: DocTree 操作封装 useDocActions

**Files:**
- Create: `src/components/DocTree/useDocActions.ts`

- [ ] **Step 1: 写 useDocActions.ts**

```ts
// 文档树操作封装：create/rename/delete + 操作后 loadTree 刷新。
// 错误统一 toast；删除当前文档后由调用方决定切到哪篇（这里只负责数据）。
import {useStore} from "../../store/index.ts";
import {createDocument, createFolder, renameEntry, deleteEntry} from "../../utils/documents.ts";
import {toast} from "../Toast/toast.ts";

export function useDocActions() {
  const loadTree = useStore((s) => s.loadTree);
  const openDocument = useStore((s) => s.openDocument);

  return {
    async newDocument(dir: string, name: string) {
      try {
        const path = await createDocument(dir, name);
        await loadTree();
        await openDocument(path);
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async newFolder(dir: string, name: string) {
      try {
        await createFolder(dir, name);
        await loadTree();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async rename(path: string, newName: string) {
      try {
        const newPath = await renameEntry(path, newName);
        await loadTree();
        // 若重命名的是当前文档，切到新路径（内容不变，仅 path 变）。
        if (useStore.getState().currentDocPath === path) {
          await openDocument(newPath);
        }
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async remove(path: string, firstDocPath: string | null) {
      try {
        await deleteEntry(path);
        await loadTree();
        if (useStore.getState().currentDocPath === path) {
          if (firstDocPath) {
            await openDocument(firstDocPath);
          } else {
            useStore.getState().setCurrentDocPath(null);
            useStore.getState().setContent("");
          }
        }
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/DocTree/useDocActions.ts
git commit -m "feat: add document tree action hook"
```

---

## Task 9: TreeNode 递归节点组件

**Files:**
- Create: `src/components/DocTree/TreeNode.tsx`

- [ ] **Step 1: 写 TreeNode.tsx**

```tsx
import {useState} from "react";
import {ChevronRight, ChevronDown, Folder, FileText, Pencil, Trash2} from "lucide-react";
import type {DocNode} from "../../utils/documents.ts";

interface Props {
  node: DocNode;
  depth: number;
  currentPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
}

export default function TreeNode({
  node, depth, currentPath, expanded, onToggle, onSelect, onRename, onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [hover, setHover] = useState(false);
  const isOpen = node.isDir && expanded.has(node.path);
  const selected = !node.isDir && currentPath === node.path;

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          paddingLeft: 8 + depth * 14,
          paddingRight: 6,
          cursor: "pointer",
          fontSize: 13,
          background: selected ? "#1e6bb8" : hover ? "#f0f2f5" : "transparent",
          color: selected ? "#fff" : "#333",
        }}
      >
        {node.isDir ? (
          isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{width: 14}} />
        )}
        {node.isDir ? <Folder size={14} /> : <FileText size={14} />}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(node.name);
              }
            }}
            style={{flex: 1, fontSize: 13, minWidth: 0}}
          />
        ) : (
          <span style={{flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {node.name}
          </span>
        )}
        {hover && !editing && (
          <>
            <Pencil
              size={13}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(node.name);
                setEditing(true);
              }}
            />
            <Trash2
              size={13}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.path);
              }}
            />
          </>
        )}
      </div>
      {isOpen &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            currentPath={currentPath}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/DocTree/TreeNode.tsx
git commit -m "feat: add recursive tree node component"
```

---

## Task 10: DocTree 侧栏容器

**Files:**
- Create: `src/components/DocTree/DocTree.tsx`

- [ ] **Step 1: 写 DocTree.tsx**

```tsx
import {useState} from "react";
import {FilePlus, FolderPlus} from "lucide-react";
import {useStore} from "../../store/index.ts";
import type {DocNode} from "../../utils/documents.ts";
import TreeNode from "./TreeNode.tsx";
import {useDocActions} from "./useDocActions.ts";

// 取树里第一篇文档路径（深度优先），删当前文档后回退用。
function firstDocPath(nodes: DocNode[]): string | null {
  for (const n of nodes) {
    if (!n.isDir) return n.path;
    const inChild = firstDocPath(n.children);
    if (inChild) return inChild;
  }
  return null;
}

export default function DocTree() {
  const tree = useStore((s) => s.tree);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const openDocument = useStore((s) => s.openDocument);
  const actions = useDocActions();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<null | "doc" | "folder">(null);
  const [draft, setDraft] = useState("");

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  // 在「当前选中文档所在文件夹」下新建；无选中则根。
  const targetDir = (): string => {
    const cur = currentDocPath;
    if (!cur) return "";
    const slash = cur.lastIndexOf("/");
    return slash === -1 ? "" : cur.slice(0, slash);
  };

  const commitCreate = async () => {
    const name = draft.trim();
    const mode = creating;
    setCreating(null);
    setDraft("");
    if (!name || !mode) return;
    if (mode === "doc") await actions.newDocument(targetDir(), name);
    else await actions.newFolder(targetDir(), name);
  };

  const handleDelete = (path: string) => {
    if (!window.confirm("确定删除？")) return;
    void actions.remove(path, firstDocPath(tree));
  };

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid #e8e8e8",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{display: "flex", gap: 4, padding: 8, borderBottom: "1px solid #e8e8e8"}}>
        <button type="button" title="新建文档" onClick={() => {setCreating("doc"); setDraft("");}}
          style={btnStyle}><FilePlus size={15} /></button>
        <button type="button" title="新建文件夹" onClick={() => {setCreating("folder"); setDraft("");}}
          style={btnStyle}><FolderPlus size={15} /></button>
      </div>

      <div style={{flex: 1, overflowY: "auto", paddingTop: 4}}>
        {creating && (
          <div style={{padding: "4px 8px"}}>
            <input
              autoFocus
              placeholder={creating === "doc" ? "文档名" : "文件夹名"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitCreate();
                if (e.key === "Escape") {setCreating(null); setDraft("");}
              }}
              style={{width: "100%", fontSize: 13, boxSizing: "border-box"}}
            />
          </div>
        )}
        {tree.length === 0 && !creating ? (
          <div style={{padding: 16, fontSize: 12, color: "#999", lineHeight: 1.6}}>
            点击上方 + 新建第一篇文档
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              currentPath={currentDocPath}
              expanded={expanded}
              onToggle={toggle}
              onSelect={openDocument}
              onRename={actions.rename}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 28,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  color: "#333",
};
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/DocTree/DocTree.tsx
git commit -m "feat: add document tree sidebar container"
```

---

## Task 11: 发布 Rust 命令（upload_thumb + add_draft）

**Files:**
- Modify: `src-tauri/src/wechat.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: 在 wechat.rs 加命令**

`src-tauri/src/wechat.rs` 顶部 `UploadResp` 加 media_id 字段：
```rust
#[derive(Deserialize)]
struct UploadResp {
    url: Option<String>,
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}
```

文件末尾加：
```rust
#[derive(Deserialize)]
struct DraftResp {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

// 上传封面图，走 add_material(type=image)，取 media_id（区别于 upload_image 取 url）。
async fn upload_thumb_inner(
    token: &str,
    bytes: Vec<u8>,
    filename: &str,
    mime: &str,
) -> Result<String, (Option<i64>, String)> {
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| (None, format!("构造表单失败：{e}")))?;
    let form = reqwest::multipart::Form::new().part("media", part);
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| (None, format!("上传请求失败：{e}")))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{e}")))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((data.errcode, data.errmsg.unwrap_or_else(|| "微信上传失败".into()))),
    }
}

#[tauri::command]
pub async fn upload_thumb(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    if bytes.len() > MAX_SIZE {
        return Err("图片不能超过 10MB".into());
    }
    let name = if filename.is_empty() { "thumb".to_string() } else { filename };
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_thumb_inner(&token, bytes.clone(), &name, &mime).await {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                clear_token_blocking();
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_thumb_inner(&token, bytes, &name, &mime).await.map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

async fn add_draft_inner(
    token: &str,
    title: &str,
    content: &str,
    thumb_media_id: &str,
) -> Result<String, (Option<i64>, String)> {
    let body = serde_json::json!({
        "articles": [{
            "title": title,
            "content": content,
            "thumb_media_id": thumb_media_id,
            "author": "",
            "digest": "",
            "content_source_url": ""
        }]
    });
    let url = format!("https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| (None, format!("发布请求失败：{e}")))?;
    let data: DraftResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析发布响应失败：{e}")))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((data.errcode, data.errmsg.unwrap_or_else(|| "微信发布失败".into()))),
    }
}

#[tauri::command]
pub async fn add_draft(
    app: AppHandle,
    title: String,
    content: String,
    thumb_media_id: String,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match add_draft_inner(&token, &title, &content, &thumb_media_id).await {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                clear_token_blocking();
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                add_draft_inner(&token, &title, &content, &thumb_media_id).await.map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}
```
> 注：`serde_json` 已是依赖（themes.rs 用了）。`UploadResp` 加 media_id 不影响 upload_image（它读 url）。

- [ ] **Step 2: lib.rs 注册**

invoke_handler 列表 `documents::delete_entry` 后加逗号续：
```rust
            documents::delete_entry,
            wechat::upload_thumb,
            wechat::add_draft
```

- [ ] **Step 3: 编译**

Run: `cd src-tauri && cargo build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/wechat.rs src-tauri/src/lib.rs
git commit -m "feat: add upload_thumb and add_draft wechat commands"
```

---

## Task 12: 发布前端封装 publish.ts

**Files:**
- Create: `src/utils/publish.ts`

- [ ] **Step 1: 写 publish.ts**

```ts
// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";

const MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

// 返回正文里仍为非 mmbiz 远程/本地图片的 url 列表（发布前需先上传）。
export function findUnuploadedImages(markdown: string): string[] {
  const refs = scanMarkdownMedia(markdown);
  const bad: string[] = [];
  for (const ref of refs) {
    if (ref.mediaType !== "image") continue;
    if (ref.sourceType === "remote") {
      const isMmbiz = MMBIZ_HOSTS.some((h) => ref.originalUrl.includes(h));
      if (!isMmbiz) bad.push(ref.originalUrl);
    } else if (ref.sourceType === "local") {
      bad.push(ref.originalUrl);
    }
  }
  return bad;
}

export async function uploadThumb(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return invoke<string>("upload_thumb", {
    bytes,
    filename: file.name || "thumb",
    mime: file.type,
  });
}

export function addDraft(title: string, content: string, thumbMediaId: string): Promise<string> {
  return invoke<string>("add_draft", {title, content, thumbMediaId});
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/utils/publish.ts
git commit -m "feat: add publish helpers with unuploaded-image check"
```

---

## Task 13: PublishDialog + PublishButton

**Files:**
- Create: `src/components/Publish/PublishDialog.tsx`, `src/components/Publish/PublishButton.tsx`

- [ ] **Step 1: 写 PublishDialog.tsx**

```tsx
import {useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {solveHtml} from "../../markdown/converter.ts";
import {findUnuploadedImages, uploadThumb, addDraft} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";

interface Props {
  onClose: () => void;
  onNeedSettings: () => void;
}

export default function PublishDialog({onClose, onNeedSettings}: Props) {
  const content = useStore((s) => s.content);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const defaultTitle = currentDocPath
    ? currentDocPath.split("/").pop()!.replace(/\.md$/, "")
    : "未命名";
  const [title, setTitle] = useState(defaultTitle);
  const [thumbId, setThumbId] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickThumb = async (file: File) => {
    setBusy(true);
    try {
      const id = await uploadThumb(file);
      setThumbId(id);
      setThumbPreview(URL.createObjectURL(file));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信图床，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`封面上传失败：${msg}`, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const bad = findUnuploadedImages(content);
    if (bad.length > 0) {
      toast.show(`正文有 ${bad.length} 张未上传的图片，请先上传图片再发布`, "error");
      return;
    }
    if (!title.trim()) {
      toast.show("请填写标题", "error");
      return;
    }
    if (!thumbId) {
      toast.show("请选择封面图", "error");
      return;
    }
    setBusy(true);
    try {
      const html = solveHtml();
      await addDraft(title.trim(), html, thumbId);
      toast.show("已发到公众号草稿箱，请在后台确认排版后发送", "info", 4000);
      onClose();
    } catch (e) {
      toast.show(`发布失败：${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{margin: "0 0 16px", fontSize: 16}}>发布到公众号草稿箱</h3>

        <label style={labelStyle}>标题</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>封面图（必填）</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          style={{display: "none"}}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickThumb(f);
          }}
        />
        <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 16}}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={secondaryBtn}>
            选择封面
          </button>
          {thumbPreview && (
            <img src={thumbPreview} alt="封面" style={{height: 48, borderRadius: 4}} />
          )}
        </div>

        <div style={{display: "flex", justifyContent: "flex-end", gap: 8}}>
          <button type="button" onClick={onClose} style={secondaryBtn}>取消</button>
          <button type="button" onClick={publish} disabled={busy} style={primaryBtn}>
            {busy ? "处理中…" : "发布到草稿箱"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900,
};
const panel: React.CSSProperties = {
  width: 420, background: "#fff", borderRadius: 8, padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
};
const labelStyle: React.CSSProperties = {display: "block", fontSize: 13, color: "#666", marginBottom: 4};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 32, padding: "0 8px", marginBottom: 16,
  border: "1px solid #d9d9d9", borderRadius: 4, boxSizing: "border-box", fontSize: 14,
};
const secondaryBtn: React.CSSProperties = {
  height: 32, padding: "0 16px", border: "1px solid #d9d9d9",
  borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  height: 32, padding: "0 16px", border: "none",
  borderRadius: 4, background: "#07c160", color: "#fff", cursor: "pointer", fontSize: 14,
};
```

- [ ] **Step 2: 写 PublishButton.tsx**

```tsx
import {useState} from "react";
import PublishDialog from "./PublishDialog.tsx";

interface Props {
  onNeedSettings: () => void;
}

export default function PublishButton({onNeedSettings}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          height: 30, padding: "0 12px", fontSize: 13,
          border: "1px solid #07c160", borderRadius: 4,
          background: "#fff", color: "#07c160", cursor: "pointer",
        }}
      >
        发布
      </button>
      {open && <PublishDialog onClose={() => setOpen(false)} onNeedSettings={onNeedSettings} />}
    </>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/components/Publish/PublishDialog.tsx src/components/Publish/PublishButton.tsx
git commit -m "feat: add publish dialog and button"
```

---

## Task 14: App.tsx 集成（三栏 + 启动加载/迁移 + 关窗 flush + alert→toast + 挂 Toaster + 发布按钮）

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 加 import**

```ts
import DocTree from "./components/DocTree/DocTree.tsx";
import PublishButton from "./components/Publish/PublishButton.tsx";
import Toaster from "./components/Toast/Toaster.tsx";
import {toast} from "./components/Toast/toast.ts";
import {listDocuments, createDocument, writeDocument} from "./utils/documents.ts";
import {flushSave} from "./store/index.ts";
import {getCurrentWindow} from "@tauri-apps/api/window";
```

- [ ] **Step 2: 从 store 取新字段**

把 `const {content, markdownThemeId, themes, setContent, setThemes, setMarkdownTheme} = useStore();`
改为加 `loadTree, openDocument, currentDocPath`：
```ts
const {content, markdownThemeId, themes, currentDocPath, setContent, setThemes, setMarkdownTheme, loadTree, openDocument} = useStore();
```

- [ ] **Step 3: 替换两处 window.alert 为 toast**

`handleUploadFile` 里：
```ts
      if (err.code === "NOT_CONFIGURED") {
        toast.show("尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。", "error");
        setSettingsOpen(true);
      } else {
        toast.show(err.message || "图片上传失败", "error");
      }
```

- [ ] **Step 4: 替换「首次加载默认内容」effect 为「加载树 + 迁移 + 打开」**

删掉现有的 `loadAllThemes` 之外的「首次加载默认教程内容」effect（第 55-59 行那个），新增文档启动 effect：
```ts
  // 启动：加载文档树；迁移旧 localStorage 草稿；决定打开哪篇。
  useEffect(() => {
    (async () => {
      const tree = await listDocuments();
      const persistedPath = useStore.getState().currentDocPath;
      const legacyContent = useStore.getState().content;

      // 迁移：documents/ 为空 且有旧 content → 存成 草稿.md。
      if (tree.length === 0 && legacyContent) {
        const path = await createDocument("", "草稿");
        await writeDocument(path, legacyContent);
        await loadTree();
        await openDocument(path);
        return;
      }
      // 首次空仓库且无旧内容：写一篇默认教程。
      if (tree.length === 0 && !legacyContent && defaultContent) {
        const path = await createDocument("", "示例");
        await writeDocument(path, defaultContent);
        await loadTree();
        await openDocument(path);
        return;
      }
      await loadTree();
      const flat = flattenFirst(tree);
      if (persistedPath && existsInTree(tree, persistedPath)) {
        await openDocument(persistedPath);
      } else if (flat) {
        await openDocument(flat);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

在 App 组件文件底部（组件外）加两个 helper：
```ts
function flattenFirst(nodes: {isDir: boolean; path: string; children: any[]}[]): string | null {
  for (const n of nodes) {
    if (!n.isDir) return n.path;
    const c = flattenFirst(n.children);
    if (c) return c;
  }
  return null;
}
function existsInTree(nodes: {isDir: boolean; path: string; children: any[]}[], path: string): boolean {
  for (const n of nodes) {
    if (!n.isDir && n.path === path) return true;
    if (n.isDir && existsInTree(n.children, path)) return true;
  }
  return false;
}
```

- [ ] **Step 5: 关窗 flush effect**

```ts
  // 关窗前把当前文档落盘，防丢最后 800ms 编辑。
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      await flushSave();
      await win.destroy();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);
```

- [ ] **Step 6: 布局加侧栏 + 发布按钮 + Toaster**

主体 `<main>` 内、编辑器 `<div>` 之前插入 `<DocTree />`：
```tsx
      <main style={{flex: 1, display: "flex", minHeight: 0, position: "relative"}}>
        <DocTree />
        <div style={{flex: 1, borderRight: "1px solid #e8e8e8", minWidth: 0, overflow: "hidden"}}>
          <MarkdownEditor ... />
        </div>
        ...
      </main>
```

navbar 右侧在 `<CopyButton />` 前加发布按钮：
```tsx
          <PublishButton onNeedSettings={() => setSettingsOpen(true)} />
          <CopyButton />
```

footer 当前文档名（可选，把现有「主题 {name}」那行后加）：
```tsx
        {currentDocPath && <span>文档 {currentDocPath.split("/").pop()}</span>}
```

根 `<div>` 末尾（`{settingsOpen && ...}` 后）加：
```tsx
      <Toaster />
```

- [ ] **Step 7: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 零错误。若 `@tauri-apps/api/window` 报缺，确认 `@tauri-apps/api` 已装（package.json 有 `^2`），其 window 子模块自带。

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate doc tree, publish, toast, autosave lifecycle into app"
```

---

## Task 15: 全量验证 + 运行时手验

**Files:** 无（验证任务）

- [ ] **Step 1: 类型 + 单测 + build**

Run:
```bash
npx tsc -b --noEmit && npm test && npm run build
```
Expected: tsc 零错；test 全 PASS（含 autosave 3 + 现有用例）；build 通过。

- [ ] **Step 2: Rust 编译 + 测试**

Run: `cd src-tauri && cargo build && cargo test`
Expected: 通过。

- [ ] **Step 3: 运行时手验（`npx tauri dev`）**

逐项确认：
- [ ] 启动：旧 localStorage 草稿迁移成「草稿」文档（或空仓库出「示例」）；树显示。
- [ ] 新建文档/文件夹：inline 输入回车 → 出现在树里 → 新文档自动打开。
- [ ] 重命名文档/文件夹：hover 出铅笔 → 改名回车 → 树刷新；改当前文档名内容不丢。
- [ ] 删除：hover 出垃圾桶 → confirm → 删除；删非空文件夹被拒并 toast 提示。
- [ ] 切换不丢编辑：编辑 A → 立即点 B → 切回 A，A 的编辑在。
- [ ] 关窗重开：编辑后立即关窗 → 重开内容在。
- [ ] 撤销/重做按钮：点击生效；Ctrl+Z/Y 仍生效。
- [ ] 发布：未配置凭证 → 提示去设置；正文有外链图 → 拦截提示；选封面上传成功显缩略图；发布成功 toast，公众号后台草稿箱可见、封面正确。
- [ ] toast：上传失败/发布提示走右下角 toast，无原生 alert。

- [ ] **Step 4: 更新 PROGRESS.md**

在 `docs/PROGRESS.md` 末尾追加本功能小结（架构决策 + 踩坑），与既有章节风格一致。

- [ ] **Step 5: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: log multi-doc management and draft publishing"
```

---

## Self-Review 检查结果

**Spec 覆盖：**
- 多文档存储/树/沙箱 → Task 1, 2 ✓
- debounce 自动保存 + 切换/关窗时序 → Task 4, 5, 14 ✓
- 树 UI 基础操作集 + 非空禁删 + 空状态 → Task 8, 9, 10, 1(删) ✓
- localStorage 迁移 → Task 14 ✓
- 发布草稿箱 + upload_thumb + 外链图校验 → Task 11, 12, 13 ✓
- 撤销/重做按钮 → Task 6, 7 ✓
- 轻量 toast → Task 3, 14 ✓

**类型一致性：** `DocNode`(Rust snake_case→前端 camelCase 归一，Task 2)、`flushSave`/`scheduleSave`(Task 5 定义、Task 14 用)、`openDocument`/`loadTree`/`setCurrentDocPath`(Task 5 定义、Task 8/10/14 用)、`toast.show`(Task 3 定义、Task 8/13/14 用)、`findUnuploadedImages`/`uploadThumb`/`addDraft`(Task 12 定义、Task 13 用)、`upload_thumb`/`add_draft`(Task 11 命令、Task 12 invoke)——签名一致。

**无占位符：** 所有步骤含完整代码/命令/预期输出。Task 7 的 `iconBtnStyle` 显式说明复用现有按钮样式（需 Step 1 读现状），非占位。
