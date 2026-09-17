// 文档树操作封装：create/rename/delete + 操作后 loadTree 刷新。
// 错误统一 toast；删除当前文档后由调用方决定切到哪篇（这里只负责数据）。
import {useMemo} from "react";
import {flushSave, scheduleCloudSync, useStore} from "../../store/index.ts";
import {
  createDocument,
  createFolder,
  renameEntry,
  deleteEntry,
  moveEntry,
  openEntryLocation,
} from "../../utils/documents.ts";
import {remapPath, replaceTreePaths} from "./pathRemap.ts";
import {toast} from "../Toast/toast.ts";
import {copyAbsolutePath as copyAbsolutePathToClipboard} from "./copyAbsolutePath.ts";
import {
  cancelBackgroundDocumentTargets,
  remapBackgroundDocumentTargets,
  runBackgroundDocumentMutation,
} from "../../utils/backgroundDocumentUpdates.ts";
import {imageUploadTasks} from "../../utils/imageUploadTasks.ts";

export interface RenameOutcome {
  ok: boolean;
  oldPath: string;
  newPath: string; // ok 时为新路径；失败时等于 oldPath
  error?: string;
}

export function useDocActions() {
  const loadTree = useStore((s) => s.loadTree);
  const openDocument = useStore((s) => s.openDocument);
  const remapDocumentThemePaths = useStore((s) => s.remapDocumentThemePaths);
  const removeDocumentThemePaths = useStore((s) => s.removeDocumentThemePaths);

  // 返回稳定引用：方法闭包只依赖上述 store action（本身稳定），
  // useMemo 保证 DocTree 每次渲染拿到同一对象，配合 TreeNode memo 生效。
  return useMemo(() => ({
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
    async rename(path: string, newName: string): Promise<RenameOutcome> {
      try {
        const newPath = await runBackgroundDocumentMutation(
          async () => {
            // 队列中更早的后台写回可能刚触发 autosave，变更路径前必须再次落盘。
            await flushSave();
            return renameEntry(path, newName);
          },
          (nextPath) => remapBackgroundDocumentTargets(path, nextPath),
        );
        imageUploadTasks.remapDocumentPaths(path, newPath);
        remapDocumentThemePaths(path, newPath);
        const state = useStore.getState();
        const nextCurrentPath = remapPath(state.currentDocPath, path, newPath);
        const nextSelectedPath = remapPath(state.selectedPath, path, newPath);
        // 乐观替换：不等后端全量重扫，改名结果立刻反映到树上（展开态与滚动位置也好保持）。
        useStore.setState({tree: replaceTreePaths(state.tree, path, newPath)});
        if (nextCurrentPath !== state.currentDocPath) state.setCurrentDocPath(nextCurrentPath);
        if (nextSelectedPath !== state.selectedPath) state.setSelectedPath(nextSelectedPath);
        await loadTree();
        scheduleCloudSync();
        return {ok: true, oldPath: path, newPath};
      } catch (e) {
        const message = String(e);
        toast.show(message, "error");
        return {ok: false, oldPath: path, newPath: path, error: message};
      }
    },
    async remove(path: string, firstDocPath: string | null, options: {recursive?: boolean} = {}) {
      try {
        const previousDocPath = useStore.getState().currentDocPath;
        await runBackgroundDocumentMutation(
          async () => {
            await flushSave();
            const layouts = useStore.getState().documentLayouts;
            const layoutJson = JSON.stringify(Object.fromEntries(Object.entries(layouts).filter(([key]) => key === path || key.startsWith(`${path}/`))));
            return deleteEntry(path, {recursive: options.recursive, layoutJson});
          },
          () => cancelBackgroundDocumentTargets(path),
        );
        removeDocumentThemePaths(path);
        const state = useStore.getState();
        if (previousDocPath === path || previousDocPath?.startsWith(`${path}/`)) {
          // 删除成功后立即解除编辑器与旧路径的绑定，避免刷新目录树期间重建已删文件。
          state.setCurrentDocPath(null);
          state.setContent("");
        }
        const selectedPath = state.selectedPath;
        if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
          state.setSelectedPath(null);
        }
        await loadTree();
        if ((previousDocPath === path || previousDocPath?.startsWith(`${path}/`)) && firstDocPath) {
          await openDocument(firstDocPath);
        }
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async move(src: string, destDir: string) {
      try {
        const newPath = await runBackgroundDocumentMutation(
          async () => {
            await flushSave();
            return moveEntry(src, destDir);
          },
          (nextPath) => remapBackgroundDocumentTargets(src, nextPath),
        );
        imageUploadTasks.remapDocumentPaths(src, newPath);
        remapDocumentThemePaths(src, newPath);
        const state = useStore.getState();
        const nextCurrentPath = remapPath(state.currentDocPath, src, newPath);
        const nextSelectedPath = remapPath(state.selectedPath, src, newPath);
        if (nextCurrentPath !== state.currentDocPath) state.setCurrentDocPath(nextCurrentPath);
        if (nextSelectedPath !== state.selectedPath) state.setSelectedPath(nextSelectedPath);
        await loadTree();
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
  }), [loadTree, openDocument, remapDocumentThemePaths, removeDocumentThemePaths]);
}
