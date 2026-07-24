// 文档树操作封装：create/rename/delete + 操作后 loadTree 刷新。
// 错误统一 toast；删除当前文档后由调用方决定切到哪篇（这里只负责数据）。
import {flushSave, scheduleCloudSync, useStore} from "../../store/index.ts";
import {createDocument, createFolder, renameEntry, deleteEntry, moveEntry, openEntryLocation} from "../../utils/documents.ts";
import {toast} from "../Toast/toast.ts";
import {copyAbsolutePath as copyAbsolutePathToClipboard} from "./copyAbsolutePath.ts";

function remapPath(path: string | null, fromPath: string, toPath: string): string | null {
  if (!path) return path;
  if (path === fromPath) return toPath;
  return path.startsWith(`${fromPath}/`) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

export function useDocActions() {
  const loadTree = useStore((s) => s.loadTree);
  const openDocument = useStore((s) => s.openDocument);
  const remapDocumentThemePaths = useStore((s) => s.remapDocumentThemePaths);
  const removeDocumentThemePaths = useStore((s) => s.removeDocumentThemePaths);

  return {
    async newDocument(dir: string, name: string) {
      try {
        const path = await createDocument(dir, name);
        await loadTree();
        await openDocument(path);
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async newFolder(dir: string, name: string) {
      try {
        await createFolder(dir, name);
        await loadTree();
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async rename(path: string, newName: string) {
      try {
        // 先完成当前文章保存，避免重命名后 autosave 又把旧路径写回来。
        await flushSave();
        const newPath = await renameEntry(path, newName);
        await loadTree();
        remapDocumentThemePaths(path, newPath);
        const state = useStore.getState();
        const nextCurrentPath = remapPath(state.currentDocPath, path, newPath);
        const nextSelectedPath = remapPath(state.selectedPath, path, newPath);
        if (nextCurrentPath !== state.currentDocPath) state.setCurrentDocPath(nextCurrentPath);
        if (nextSelectedPath !== state.selectedPath) state.setSelectedPath(nextSelectedPath);
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async remove(path: string, firstDocPath: string | null, options: {recursive?: boolean} = {}) {
      try {
        await flushSave();
        const previousDocPath = useStore.getState().currentDocPath;
        await deleteEntry(path, {recursive: options.recursive});
        await loadTree();
        removeDocumentThemePaths(path);
        if (previousDocPath === path || previousDocPath?.startsWith(`${path}/`)) {
          if (firstDocPath) {
            await openDocument(firstDocPath);
          } else {
            useStore.getState().setCurrentDocPath(null);
            useStore.getState().setContent("");
          }
        }
        const selectedPath = useStore.getState().selectedPath;
        if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
          useStore.getState().setSelectedPath(null);
        }
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async move(src: string, destDir: string) {
      try {
        await flushSave();
        const newPath = await moveEntry(src, destDir);
        await loadTree();
        remapDocumentThemePaths(src, newPath);
        const state = useStore.getState();
        const nextCurrentPath = remapPath(state.currentDocPath, src, newPath);
        const nextSelectedPath = remapPath(state.selectedPath, src, newPath);
        if (nextCurrentPath !== state.currentDocPath) state.setCurrentDocPath(nextCurrentPath);
        if (nextSelectedPath !== state.selectedPath) state.setSelectedPath(nextSelectedPath);
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async openLocation(path: string) {
      try {
        await openEntryLocation(path);
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async copyAbsolutePath(path: string) {
      try {
        await copyAbsolutePathToClipboard(path);
        toast.show("绝对路径已复制");
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
  };
}
