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
