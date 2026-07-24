// 前端封装文档树 Tauri 命令。DocNode 与 Rust documents.rs 同构。
import {invoke} from "@tauri-apps/api/core";
import {isTauriRuntime} from "./tauriEnv.ts";
import {
  DOCUMENT_THEME_MAP_FILE,
  parseDocumentThemeMap,
  type DocumentThemeMap,
} from "./documentThemes.ts";

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

const WEB_SAMPLE_PATH = "示例.md";
const WEB_SAMPLE_CONTENT = `# 文澜排版

欢迎使用！左侧编辑 **Markdown**，右侧实时预览，点右上角「复制到微信」即可粘贴到公众号编辑器。

## 文本样式

支持**加粗**、*斜体*、~~删除线~~、\`行内代码\`，以及[链接](https://example.com)。

## 列表

- 第一项
- 第二项
  - 嵌套项
`;

let webFiles = new Map<string, string>([[WEB_SAMPLE_PATH, WEB_SAMPLE_CONTENT]]);
let webDirs = new Set<string>();

function ensureMdName(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function uniquePath(path: string, exists: (candidate: string) => boolean): string {
  if (!exists(path)) return path;
  const dir = dirname(path);
  const base = basename(path);
  const dot = base.toLowerCase().endsWith(".md") ? base.length - 3 : -1;
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? ".md" : "";
  let index = 2;
  while (true) {
    const candidate = joinPath(dir, `${stem} ${index}${ext}`);
    if (!exists(candidate)) return candidate;
    index++;
  }
}

function pathExists(path: string): boolean {
  return webFiles.has(path) || webDirs.has(path);
}

function buildWebTree(): DocNode[] {
  const root: DocNode[] = [];
  const dirs = new Map<string, DocNode[]>();
  dirs.set("", root);

  const sortedDirs = Array.from(webDirs).sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const path of sortedDirs) {
    const parent = dirname(path);
    const node: DocNode = {name: basename(path), path, isDir: true, children: []};
    if (!dirs.has(parent)) dirs.set(parent, []);
    dirs.get(parent)!.push(node);
    dirs.set(path, node.children);
  }

  const sortedFiles = Array.from(webFiles.keys())
    .filter((path) => /\.md$/i.test(path))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const path of sortedFiles) {
    const parent = dirname(path);
    const node: DocNode = {name: basename(path), path, isDir: false, children: []};
    if (!dirs.has(parent)) dirs.set(parent, []);
    dirs.get(parent)!.push(node);
  }

  return root;
}

export async function listDocuments(): Promise<DocNode[]> {
  if (!isTauriRuntime()) {
    return buildWebTree();
  }
  const raw = await invoke<RawDocNode[]>("list_documents");
  return raw.map(normalize);
}

export function readDocument(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.resolve(webFiles.get(path) ?? "");
  }
  return invoke<string>("read_document", {path});
}

export function writeDocument(path: string, text: string): Promise<void> {
  if (!isTauriRuntime()) {
    webFiles.set(path, text);
    return Promise.resolve();
  }
  return invoke("write_document", {path, text});
}

// 主题映射是文档目录中的隐藏元数据文件：不出现在文档树，但会被云同步扫描。
// exists 用于区分“文件尚未创建”和“文件明确为空”，避免升级迁移时覆盖云端数据。
export async function readDocumentThemeMap(): Promise<{exists: boolean; map: DocumentThemeMap}> {
  if (!isTauriRuntime()) {
    const text = webFiles.get(DOCUMENT_THEME_MAP_FILE);
    return {
      exists: text !== undefined,
      map: parseDocumentThemeMap(text ?? ""),
    };
  }

  try {
    const text = await readDocument(DOCUMENT_THEME_MAP_FILE);
    return {exists: true, map: parseDocumentThemeMap(text)};
  } catch {
    return {exists: false, map: {}};
  }
}

export function writeDocumentThemeMap(map: DocumentThemeMap): Promise<void> {
  return writeDocument(DOCUMENT_THEME_MAP_FILE, `${JSON.stringify(map, null, 2)}\n`);
}

export function createDocument(dir: string, name: string): Promise<string> {
  if (!isTauriRuntime()) {
    const path = uniquePath(joinPath(dir, ensureMdName(name)), pathExists);
    webFiles.set(path, "");
    return Promise.resolve(path);
  }
  return invoke<string>("create_document", {dir, name});
}

export function createFolder(dir: string, name: string): Promise<string> {
  if (!isTauriRuntime()) {
    const path = uniquePath(joinPath(dir, name), pathExists);
    webDirs.add(path);
    return Promise.resolve(path);
  }
  return invoke<string>("create_folder", {dir, name});
}

export function renameEntry(path: string, newName: string): Promise<string> {
  if (!isTauriRuntime()) {
    const parent = dirname(path);
    const next = uniquePath(joinPath(parent, webFiles.has(path) ? ensureMdName(newName) : newName), (candidate) => candidate !== path && pathExists(candidate));
    if (webFiles.has(path)) {
      const text = webFiles.get(path) ?? "";
      webFiles.delete(path);
      webFiles.set(next, text);
    } else if (webDirs.has(path)) {
      const oldPrefix = `${path}/`;
      const newPrefix = `${next}/`;
      webDirs = new Set(Array.from(webDirs, (dirPath) => dirPath === path ? next : dirPath.startsWith(oldPrefix) ? newPrefix + dirPath.slice(oldPrefix.length) : dirPath));
      webFiles = new Map(Array.from(webFiles, ([filePath, text]) => [filePath.startsWith(oldPrefix) ? newPrefix + filePath.slice(oldPrefix.length) : filePath, text]));
    }
    return Promise.resolve(next);
  }
  return invoke<string>("rename_entry", {path, newName});
}

export function deleteEntry(path: string, options: {recursive?: boolean} = {}): Promise<void> {
  if (!isTauriRuntime()) {
    if (!path.trim()) {
      return Promise.reject(new Error("不能删除文档根目录"));
    }
    if (!pathExists(path)) {
      return Promise.reject(new Error("条目不存在"));
    }

    const prefix = `${path}/`;
    const isDir = webDirs.has(path);
    const hasChildren = Array.from(webDirs).some((dirPath) => dirPath.startsWith(prefix))
      || Array.from(webFiles.keys()).some((filePath) => filePath.startsWith(prefix));

    if (isDir && hasChildren && !options.recursive) {
      return Promise.reject(new Error("文件夹非空，请确认后递归删除"));
    }

    webFiles.delete(path);
    webDirs = new Set(Array.from(webDirs).filter((dirPath) => dirPath !== path && !dirPath.startsWith(prefix)));
    webFiles = new Map(Array.from(webFiles).filter(([filePath]) => !filePath.startsWith(prefix)));
    return Promise.resolve();
  }
  return invoke("delete_entry", {path, recursive: Boolean(options.recursive)});
}

export function moveEntry(src: string, destDir: string): Promise<string> {
  if (!isTauriRuntime()) {
    const next = uniquePath(joinPath(destDir, basename(src)), (candidate) => candidate !== src && pathExists(candidate));
    if (webFiles.has(src)) {
      const text = webFiles.get(src) ?? "";
      webFiles.delete(src);
      webFiles.set(next, text);
    } else if (webDirs.has(src)) {
      const oldPrefix = `${src}/`;
      const newPrefix = `${next}/`;
      webDirs = new Set(Array.from(webDirs, (dirPath) => dirPath === src ? next : dirPath.startsWith(oldPrefix) ? newPrefix + dirPath.slice(oldPrefix.length) : dirPath));
      webFiles = new Map(Array.from(webFiles, ([filePath, text]) => [filePath.startsWith(oldPrefix) ? newPrefix + filePath.slice(oldPrefix.length) : filePath, text]));
    }
    return Promise.resolve(next);
  }
  return invoke<string>("move_entry", {src, destDir});
}

export function getEntryAbsolutePath(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Web 调试模式无法复制本地绝对路径"));
  }
  return invoke<string>("get_entry_absolute_path", {path});
}

export function openEntryLocation(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Web 调试模式无法打开本地文件位置"));
  }
  return invoke("open_entry_location", {path});
}

// 在树里查某路径是否文件夹。
export function isFolderPath(nodes: DocNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return n.isDir;
    if (n.isDir && isFolderPath(n.children, path)) return true;
  }
  return false;
}

// 在树里查某相对路径是否已存在（文件或文件夹）。
export function treeHasPath(nodes: DocNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return true;
    if (n.isDir && treeHasPath(n.children, path)) return true;
  }
  return false;
}

// 新建落点：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根("")。
export function targetDirFor(tree: DocNode[], selectedPath: string | null): string {
  if (!selectedPath) return "";
  if (isFolderPath(tree, selectedPath)) return selectedPath;
  const slash = selectedPath.lastIndexOf("/");
  return slash === -1 ? "" : selectedPath.slice(0, slash);
}

// 给文档路径返回所有父级目录，用于文件树自动展开。
export function ancestorDirsForPath(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return [];

  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}
