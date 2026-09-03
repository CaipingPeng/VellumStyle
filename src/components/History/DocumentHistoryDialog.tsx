import {useEffect, useMemo, useRef, useState} from "react";
import {Clock3, RotateCcw} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";
import {toast} from "../Toast/toast.ts";
import {createLineDiff, listDocumentHistory, type DocumentHistorySnapshot} from "../../utils/documentHistory.ts";

interface Props {
  documentPath: string;
  currentContent: string;
  onRestore: (content: string) => boolean;
  onClose: () => void;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(new Date(timestamp));
}

export default function DocumentHistoryDialog({documentPath, currentContent, onRestore, onClose}: Props) {
  const [snapshots, setSnapshots] = useState<DocumentHistorySnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const firstVersionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void listDocumentHistory(documentPath).then((items) => {
      setSnapshots(items);
      setSelectedId(items.find((item) => item.content !== currentContent)?.id ?? items[0]?.id ?? null);
    }).catch((error) => {
      console.error("加载版本历史失败：", error);
      toast.show("加载版本历史失败。", "error");
    }).finally(() => setLoading(false));
    // 对话框打开前已 flush；正文变化无需重新扫描磁盘历史，否则会打断当前选择。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath]);

  useEffect(() => {
    if (!loading) firstVersionRef.current?.focus();
  }, [loading]);

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null;
  const diff = useMemo(() => selected ? createLineDiff(selected.content, currentContent) : [], [currentContent, selected]);
  const changes = diff.reduce((count, line) => count + (line.type === "same" ? 0 : 1), 0);

  const restore = () => {
    if (!selected || selected.content === currentContent) return;
    if (!window.confirm(`确定恢复到 ${formatTime(selected.createdAt)} 的版本吗？恢复前的正文仍会保留在历史中。`)) return;
    if (!onRestore(selected.content)) {
      toast.show("文章内容已变化，请重新选择版本。", "error");
      return;
    }
    onClose();
  };

  return (
    <Dialog open title={<span className="flex items-center gap-2"><Clock3 size={16} />本地版本历史</span>} onClose={onClose} width={1080} contentPadding={false} initialFocusRef={firstVersionRef} footer={<><Button onClick={onClose}>关闭</Button><Button variant="primary" disabled={!selected || selected.content === currentContent} onClick={restore}><RotateCcw size={14} />恢复此版本</Button></>}>
      <div className="flex h-[min(680px,75vh)] min-h-[420px]">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-bg-secondary/35 p-2">
          {loading ? <div className="p-3 text-sm text-text-muted">正在加载…</div> : snapshots.length === 0 ? <div className="p-3 text-sm leading-6 text-text-muted">尚无历史版本。编辑并保存文章后会自动生成。</div> : snapshots.map((snapshot, index) => {
            const isCurrent = snapshot.content === currentContent;
            return <button ref={index === 0 ? firstVersionRef : undefined} key={snapshot.id} type="button" onClick={() => setSelectedId(snapshot.id)} className={`mb-1 w-full rounded-sm px-3 py-2 text-left ${snapshot.id === selectedId ? "bg-accent-subtle text-text" : "text-text-secondary hover:bg-bg-tertiary"}`}>
              <div className="text-sm font-medium">{formatTime(snapshot.createdAt)}</div>
              <div className="mt-1 text-xs text-text-muted">{isCurrent ? "当前已保存版本" : `${snapshot.content.length} 字符`}</div>
            </button>;
          })}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-4 py-2 text-xs text-text-muted">{selected ? `所选版本 → 当前正文，共 ${changes} 行变化` : "选择左侧版本查看差异"}</div>
          <div className="min-h-0 flex-1 overflow-auto bg-bg-secondary/25 font-mono text-xs leading-5">
            {selected && diff.map((line, index) => (
              <div key={`${index}-${line.type}`} className={`grid min-h-5 grid-cols-[44px_44px_22px_minmax(0,1fr)] border-b border-border/30 ${line.type === "add" ? "bg-success/10" : line.type === "remove" ? "bg-danger/10" : ""}`}>
                <span className="select-none px-2 text-right text-text-muted">{line.oldLine ?? ""}</span>
                <span className="select-none border-l border-border/30 px-2 text-right text-text-muted">{line.newLine ?? ""}</span>
                <span className={`select-none text-center ${line.type === "add" ? "text-success" : line.type === "remove" ? "text-danger" : "text-text-muted"}`}>{line.type === "add" ? "+" : line.type === "remove" ? "−" : ""}</span>
                <span className="whitespace-pre-wrap break-words border-l border-border/30 px-2 text-text">{line.text || " "}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
