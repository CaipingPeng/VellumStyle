import {useEffect, useState} from "react";
import {listTrash, restoreTrash, type TrashEntry} from "../../utils/documents.ts";
import {restoreDocumentLayouts, scheduleCloudSync, useStore} from "../../store/index.ts";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

export default function TrashDialog({onClose}: {onClose: () => void}) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {void listTrash().then(setEntries).catch((e) => setError(String(e)));}, []);
  const restore = async (entry: TrashEntry) => {
    setBusy(true); setError("");
    try {
      // 先校验排版记录，不能在文件已经恢复后才发现格式错误。
      const layouts = entry.layoutJson ? JSON.parse(entry.layoutJson) : {};
      const result = await restoreTrash(entry.id);
      restoreDocumentLayouts(layouts, entry.path, result.path);
      setEntries((all) => all.filter((item) => item.id !== entry.id));
      await useStore.getState().loadTree();
      if (!result.isDir) await useStore.getState().openDocument(result.path);
      scheduleCloudSync();
    } catch (cause) {setError(String(cause));}
    finally {setBusy(false);}
  };
  return <Dialog open title="最近删除" onClose={onClose} closeDisabled={busy} width={560}>
    <p className="mb-3 text-sm text-text-muted">本机保留 30 天。同名文件恢复时会自动改名，不覆盖现有文章。删除会同步到云端；恢复后按新文件参与同步。</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!entries.length && <p>没有可恢复的文件。</p>}
    {entries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
      <div className="min-w-0 break-words"><p>{entry.path}</p><small>{new Date(entry.deletedAt).toLocaleString()}</small></div>
      <Button disabled={busy} onClick={() => void restore(entry)}>恢复</Button>
    </div>)}
  </Dialog>;
}
