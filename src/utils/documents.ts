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
