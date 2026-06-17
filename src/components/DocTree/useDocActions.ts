// 文档树操作封装：create/rename/delete + 操作后 loadTree 刷新。
// 错误统一 toast；删除当前文档后由调用方决定切到哪篇（这里只负责数据）。
import {scheduleCloudSync, useStore} from "../../store/index.ts";
import {createDocument, createFolder, renameEntry, deleteEntry, moveEntry, openEntryLocation} from "../../utils/documents.ts";
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
        const newPath = await renameEntry(path, newName);
        await loadTree();
        // 若重命名的是当前文档，切到新路径（内容不变，仅 path 变）。
        if (useStore.getState().currentDocPath === path) {
          await openDocument(newPath);
        }
        scheduleCloudSync();
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
        scheduleCloudSync();
      } catch (e) {
        toast.show(String(e), "error");
      }
    },
    async move(src: string, destDir: string) {
      try {
        const newPath = await moveEntry(src, destDir);
        await loadTree();
        // 若移动的是当前文档（或当前文档在被移动的文件夹内），同步当前 path。
        const cur = useStore.getState().currentDocPath;
        if (cur === src) {
          useStore.getState().setCurrentDocPath(newPath);
        } else if (cur && cur.startsWith(src + "/")) {
          // 当前文档在被移动的文件夹内：用新前缀替换。
          useStore.getState().setCurrentDocPath(newPath + cur.slice(src.length));
        }
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
  };
}
