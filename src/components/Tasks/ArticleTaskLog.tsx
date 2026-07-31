import {memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2, CircleX, ListChecks, Loader2, Trash2} from "lucide-react";
import {
  imageUploadTasks,
  type ImageUploadPhase,
  type ImageUploadTask,
} from "../../utils/imageUploadTasks.ts";

interface Props {
  currentDocumentPath: string | null;
}

const phaseLabels: Record<ImageUploadPhase, string> = {
  queued: "等待处理",
  reading: "读取文件",
  resolving: "解析路径",
  processing: "处理图片",
  downloading: "下载图片",
  preparing: "准备上传",
  compressing: "压缩中",
  uploading: "上传中",
  completed: "已完成",
  failed: "失败",
};

function formatSize(bytes?: number): string | null {
  if (bytes === undefined) return null;
  const mib = bytes / 1024 / 1024;
  return `${mib >= 10 ? mib.toFixed(1) : mib.toFixed(2)} MiB`;
}

function formatElapsed(task: ImageUploadTask, now: number): string {
  const end = task.status === "active" ? now : task.updatedAt;
  const seconds = Math.max(0, Math.floor((end - task.startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function documentLabel(task: ImageUploadTask): string {
  return task.documentTitle
    || task.documentPath?.split("/").pop()
    || "未归属文章";
}

function ArticleTaskLog({currentDocumentPath}: Props) {
  const tasks = useSyncExternalStore(
    imageUploadTasks.subscribe,
    imageUploadTasks.getSnapshot,
    imageUploadTasks.getSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState({left: 12, top: 12, width: 420});
  const activeCount = tasks.filter((task) => task.status === "active").length;
  const errorCount = tasks.filter((task) => task.status === "error").length;

  const groups = useMemo(() => {
    const grouped = new Map<string, ImageUploadTask[]>();
    for (const task of tasks) {
      const key = task.documentPath || "__unassigned__";
      grouped.set(key, [...(grouped.get(key) || []), task]);
    }
    return Array.from(grouped.entries()).sort(([leftPath, left], [rightPath, right]) => {
      if (leftPath === currentDocumentPath) return -1;
      if (rightPath === currentDocumentPath) return 1;
      const activeDifference = Number(right.some((task) => task.status === "active"))
        - Number(left.some((task) => task.status === "active"));
      if (activeDifference !== 0) return activeDifference;
      return right[0].startedAt - left[0].startedAt;
    });
  }, [currentDocumentPath, tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      setOpen(false);
      return;
    }
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      imageUploadTasks.pruneExpired(nextNow);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tasks.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(420, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(margin, rect.right - width),
        window.innerWidth - margin - width,
      );
      setPanelPosition({left, top: rect.bottom + 8, width});
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  if (tasks.length === 0) return null;

  return (
    <div ref={containerRef} className="relative ml-2 flex-none border-l border-border pl-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="文章任务日志"
        aria-expanded={open}
        title="文章任务日志"
        className={`relative grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-bg-hover ${activeCount > 0 ? "text-accent" : errorCount > 0 ? "text-danger" : "text-text-muted"}`}
      >
        {activeCount > 0 ? <Loader2 size={16} className="animate-spin" /> : <ListChecks size={16} />}
        {(activeCount > 0 || errorCount > 0) && (
          <span className={`absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 text-white ${errorCount > 0 ? "bg-danger" : "bg-accent"}`}>
            {activeCount + errorCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[2600] overflow-hidden rounded-md border border-border bg-bg shadow-xl"
          style={panelPosition}
        >
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <ListChecks size={16} />
              文章任务
              {activeCount > 0 && <span className="text-xs font-normal text-accent">{activeCount} 个进行中</span>}
            </div>
            {tasks.some((task) => task.status !== "active") && (
              <button
                type="button"
                onClick={() => imageUploadTasks.clearFinished()}
                aria-label="清除已结束任务"
                title="清除已结束任务"
                className="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-bg-hover hover:text-text"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {groups.map(([documentPath, group]) => (
              <section key={documentPath} className="border-b border-border/70 last:border-b-0">
                <div className="flex items-center justify-between bg-bg-secondary px-3 py-1.5 text-[11px] text-text-muted">
                  <span className="max-w-[300px] truncate" title={documentPath === "__unassigned__" ? undefined : documentPath}>
                    {documentLabel(group[0])}
                  </span>
                  <span>{group.length} 项</span>
                </div>
                {group.map((task) => {
                  const original = formatSize(task.originalSize);
                  const output = formatSize(task.outputSize);
                  return (
                    <div key={task.id} className="flex gap-2.5 px-3 py-2.5">
                      <div className="mt-0.5 flex-none">
                        {task.status === "active" && <Loader2 size={15} className="animate-spin text-accent" />}
                        {task.status === "success" && <CheckCircle2 size={15} className="text-success" />}
                        {task.status === "error" && <CircleX size={15} className="text-danger" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-xs font-medium text-text" title={task.filename}>{task.filename}</span>
                          <span className="flex-none text-[11px] tabular-nums text-text-muted">{formatElapsed(task, now)}</span>
                        </div>
                        <div className={`mt-1 text-[11px] ${task.status === "error" ? "text-danger" : "text-text-muted"}`}>
                          {task.category} · {phaseLabels[task.phase]}
                          {original && <span className="ml-2 tabular-nums">{original}{output && output !== original ? ` → ${output}` : ""}</span>}
                        </div>
                        {task.error && <div className="mt-1 break-words text-[11px] leading-4 text-danger">{task.error}</div>}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(ArticleTaskLog);
