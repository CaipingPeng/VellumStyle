# 文件树复制绝对路径实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为文件树中的文件和文件夹右键菜单增加可靠的“复制绝对路径”操作。

**Architecture:** Tauri 后端负责在文档根目录边界内解析并返回真实绝对路径；前端文档 API 获取该路径，一个独立可测试的复制流程复用现有 `copyPlainText`，文档树动作层负责 Toast 反馈，`TreeNode` 只负责菜单交互和传递节点相对路径。

**Tech Stack:** React 18、TypeScript、Node Test Runner、Tauri 2、Rust

---

## 文件结构

- 修改 `src-tauri/src/documents.rs`：新增存在性校验与绝对路径字符串转换函数、新 Tauri 命令及 Rust 单元测试。
- 修改 `src-tauri/src/lib.rs`：注册 `get_entry_absolute_path`。
- 修改 `src/utils/documents.ts`：新增前端命令封装和 Web 模式错误。
- 创建 `src/utils/documents.absolutePath.test.ts`：验证 Web 模式不能伪造绝对路径。
- 创建 `src/components/DocTree/copyAbsolutePath.ts`：封装“取路径 → 写剪贴板 → 判断结果”的可测试流程。
- 创建 `src/components/DocTree/copyAbsolutePath.test.ts`：验证成功、后端失败和剪贴板失败。
- 修改 `src/components/DocTree/TreeNode.tsx`：添加菜单项和回调透传。
- 修改 `src/components/DocTree/TreeNode.test.tsx`：验证文件/文件夹菜单和点击参数。
- 修改 `src/components/DocTree/useDocActions.ts`：连接复制流程和 Toast。
- 修改 `src/components/DocTree/DocTree.tsx`：把动作传入根节点。

### Task 1：后端返回可信绝对路径

**Files:**
- Modify: `src-tauri/src/documents.rs:34-56,253-318`
- Modify: `src-tauri/src/lib.rs:75-89`

- [ ] **Step 1：写失败的 Rust 单元测试**

在 `documents.rs` 测试模块中先导入待实现的 `existing_absolute_path`，使用标准库临时目录创建真实文件，断言：

```rust
#[test]
fn existing_absolute_path_returns_native_absolute_path() {
    let path = std::env::temp_dir().join(format!(
        "vellumstyle-copy-path-{}-测试.md",
        std::process::id()
    ));
    std::fs::write(&path, "test").unwrap();

    let result = existing_absolute_path(path.clone()).unwrap();

    assert_eq!(result, path.to_string_lossy());
    std::fs::remove_file(path).unwrap();
}

#[test]
fn existing_absolute_path_rejects_missing_entry() {
    let path = std::env::temp_dir().join(format!(
        "vellumstyle-copy-path-{}-missing.md",
        std::process::id()
    ));

    assert_eq!(existing_absolute_path(path).unwrap_err(), "条目不存在");
}
```

- [ ] **Step 2：运行测试并确认因功能缺失而失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml existing_absolute_path`

Expected: FAIL，提示无法找到 `existing_absolute_path`。

- [ ] **Step 3：实现最小后端函数和 Tauri 命令**

```rust
fn existing_absolute_path(full: PathBuf) -> Result<String, String> {
    if !full.exists() {
        return Err("条目不存在".into());
    }
    full.into_os_string()
        .into_string()
        .map_err(|_| "绝对路径包含无效字符".to_string())
}

#[tauri::command]
pub fn get_entry_absolute_path(app: AppHandle, path: String) -> Result<String, String> {
    existing_absolute_path(resolve_in_documents(&app, &path)?)
}
```

在 `lib.rs` 的 `generate_handler!` 中注册 `documents::get_entry_absolute_path`。

- [ ] **Step 4：运行目标测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml existing_absolute_path`

Expected: 2 tests PASS。

- [ ] **Step 5：提交后端改动**

```powershell
git add src-tauri/src/documents.rs src-tauri/src/lib.rs
git commit -m "feat: expose document absolute paths"
```

### Task 2：增加前端绝对路径 API

**Files:**
- Create: `src/utils/documents.absolutePath.test.ts`
- Modify: `src/utils/documents.ts:214-219`

- [ ] **Step 1：写 Web 模式失败路径测试**

```typescript
import assert from "node:assert/strict";
import {test} from "node:test";
import {getEntryAbsolutePath} from "./documents.ts";

test("Web 模式拒绝伪造本地绝对路径", async () => {
  await assert.rejects(
    getEntryAbsolutePath("草稿.md"),
    /Web 调试模式无法复制本地绝对路径/,
  );
});
```

- [ ] **Step 2：运行测试并确认因导出缺失而失败**

Run: `npm test -- src/utils/documents.absolutePath.test.ts`

Expected: FAIL，提示 `getEntryAbsolutePath` 不存在。

- [ ] **Step 3：实现最小前端封装**

```typescript
export function getEntryAbsolutePath(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Web 调试模式无法复制本地绝对路径"));
  }
  return invoke<string>("get_entry_absolute_path", {path});
}
```

- [ ] **Step 4：运行目标测试确认通过**

Run: `npm test -- src/utils/documents.absolutePath.test.ts`

Expected: 1 test PASS。

- [ ] **Step 5：提交前端 API**

```powershell
git add src/utils/documents.ts src/utils/documents.absolutePath.test.ts
git commit -m "feat: add absolute path document API"
```

### Task 3：实现可测试的剪贴板流程

**Files:**
- Create: `src/components/DocTree/copyAbsolutePath.ts`
- Create: `src/components/DocTree/copyAbsolutePath.test.ts`

- [ ] **Step 1：写成功测试**

```typescript
import assert from "node:assert/strict";
import {test} from "node:test";
import {copyAbsolutePath} from "./copyAbsolutePath.ts";

test("获取绝对路径后将原文本写入剪贴板", async () => {
  const copied: string[] = [];
  await copyAbsolutePath(
    "资料/草稿.md",
    async () => "C:\\文澜排版\\documents\\资料\\草稿.md",
    async (text) => {
      copied.push(text);
      return true;
    },
  );

  assert.deepEqual(copied, ["C:\\文澜排版\\documents\\资料\\草稿.md"]);
});
```

- [ ] **Step 2：运行测试并确认模块缺失**

Run: `npm test -- src/components/DocTree/copyAbsolutePath.test.ts`

Expected: FAIL，提示找不到 `copyAbsolutePath.ts`。

- [ ] **Step 3：实现最小复制流程**

```typescript
import {copyPlainText} from "../../utils/clipboard.ts";
import {getEntryAbsolutePath} from "../../utils/documents.ts";

export async function copyAbsolutePath(
  path: string,
  getPath: (path: string) => Promise<string> = getEntryAbsolutePath,
  copyText: (text: string) => Promise<boolean> = copyPlainText,
): Promise<void> {
  const absolutePath = await getPath(path);
  if (!(await copyText(absolutePath))) {
    throw new Error("复制绝对路径失败");
  }
}
```

- [ ] **Step 4：增加剪贴板失败和路径获取失败测试**

```typescript
test("剪贴板拒绝写入时报告失败", async () => {
  await assert.rejects(
    copyAbsolutePath("草稿.md", async () => "C:\\草稿.md", async () => false),
    /复制绝对路径失败/,
  );
});

test("获取路径失败时保留原错误", async () => {
  await assert.rejects(
    copyAbsolutePath("草稿.md", async () => { throw new Error("条目不存在"); }),
    /条目不存在/,
  );
});
```

- [ ] **Step 5：运行测试确认全部通过**

Run: `npm test -- src/components/DocTree/copyAbsolutePath.test.ts`

Expected: 3 tests PASS。

- [ ] **Step 6：提交复制流程**

```powershell
git add src/components/DocTree/copyAbsolutePath.ts src/components/DocTree/copyAbsolutePath.test.ts
git commit -m "feat: add absolute path copy flow"
```

### Task 4：添加右键菜单交互

**Files:**
- Modify: `src/components/DocTree/TreeNode.tsx:1-39,83-91,204-265`
- Modify: `src/components/DocTree/TreeNode.test.tsx:7-75`

- [ ] **Step 1：扩展测试渲染器以记录复制回调**

让 `renderTreeNode` 接受可选属性覆盖，并给默认属性添加 `onCopyAbsolutePath: () => {}`。

- [ ] **Step 2：写文件节点菜单失败测试**

```typescript
test("文件节点右键菜单可复制绝对路径", () => {
  const copied: string[] = [];
  const {container, cleanup} = renderTreeNode(fileNode, {
    onCopyAbsolutePath: (path) => copied.push(path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(
        new window.MouseEvent("contextmenu", {bubbles: true, clientX: 20, clientY: 20}),
      );
    });
    const button = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("复制绝对路径"));
    assert.ok(button);
    act(() => button.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
    assert.deepEqual(copied, ["草稿.md"]);
    assert.equal(container.textContent?.includes("复制绝对路径"), false);
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 3：写文件夹节点菜单失败测试**

使用 `{name: "资料", path: "资料", isDir: true, children: []}`，断言同一菜单项存在且点击传递 `"资料"`。

- [ ] **Step 4：运行测试并确认缺少回调属性或菜单项**

Run: `npm test -- src/components/DocTree/TreeNode.test.tsx`

Expected: FAIL，原因是 `onCopyAbsolutePath` 尚未实现或菜单项不存在。

- [ ] **Step 5：实现菜单项和递归回调透传**

- 从 `lucide-react` 导入 `Copy`。
- `Props` 新增 `onCopyAbsolutePath: (path: string) => void`。
- 根组件解构该回调，并在子 `TreeNode` 中继续传递。
- 在“打开文件位置”按钮下增加同样样式的按钮：

```tsx
<button
  type="button"
  className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
  onClick={() => {
    setContextMenu(null);
    onCopyAbsolutePath(node.path);
  }}
>
  <Copy size={14} />
  复制绝对路径
</button>
```

- 将菜单纵坐标钳制值从 `window.innerHeight - 44` 改为 `window.innerHeight - 80`，为两行菜单预留空间，避免靠近视窗底部时溢出。

- [ ] **Step 6：运行目标测试确认通过**

Run: `npm test -- src/components/DocTree/TreeNode.test.tsx`

Expected: 现有 2 项和新增 2 项测试全部 PASS。

- [ ] **Step 7：提交菜单交互**

```powershell
git add src/components/DocTree/TreeNode.tsx src/components/DocTree/TreeNode.test.tsx
git commit -m "feat: add copy path context menu item"
```

### Task 5：连接动作层与用户反馈

**Files:**
- Modify: `src/components/DocTree/useDocActions.ts:3-86`
- Modify: `src/components/DocTree/DocTree.tsx:154-215`

- [ ] **Step 1：在动作层连接复制流程**

导入 `copyAbsolutePath as copyAbsolutePathToClipboard`，在 `useDocActions` 返回对象中加入：

```typescript
async copyAbsolutePath(path: string) {
  try {
    await copyAbsolutePathToClipboard(path);
    toast.show("绝对路径已复制");
  } catch (error) {
    toast.show(String(error), "error");
  }
},
```

- [ ] **Step 2：将动作传入文档树节点**

在 `DocTree.tsx` 的根 `TreeNode` 增加：

```tsx
onCopyAbsolutePath={(path) => void actions.copyAbsolutePath(path)}
```

- [ ] **Step 3：运行相关前端测试**

Run: `npm test -- src/components/DocTree/copyAbsolutePath.test.ts src/components/DocTree/TreeNode.test.tsx src/utils/documents.absolutePath.test.ts`

Expected: 所有目标测试 PASS，无 React `act` 警告。

- [ ] **Step 4：运行 TypeScript 构建**

Run: `npm run build`

Expected: TypeScript 和 Vite 构建成功，无缺失属性或导入错误。

- [ ] **Step 5：提交集成改动**

```powershell
git add src/components/DocTree/useDocActions.ts src/components/DocTree/DocTree.tsx
git commit -m "feat: wire copy absolute path action"
```

### Task 6：完整回归验证

**Files:**
- Verify only

- [ ] **Step 1：运行全部前端测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 2：运行生产构建**

Run: `npm run build`

Expected: 构建成功。

- [ ] **Step 3：运行全部 Rust 测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 全部 PASS。

- [ ] **Step 4：检查改动质量**

Run: `git diff --check`

Expected: 无空白错误；仅有本计划要求的改动。
