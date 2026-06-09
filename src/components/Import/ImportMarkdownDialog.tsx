import type {ImportMarkdownProgress, ImportMarkdownResult} from "../../utils/markdownImport.ts";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

interface Props {
  open: boolean;
  markdownPath: string;
  resourceRoot: string;
  progress: ImportMarkdownProgress | null;
  result: ImportMarkdownResult | null;
  error: string;
  importing: boolean;
  onPickMarkdown: () => void;
  onPickResourceRoot: () => void;
  onStart: () => void;
  onClose: () => void;
}

const phaseText: Record<string, string> = {
  reading: "读取 Markdown",
  scanning: "扫描图片引用",
  resolving: "解析本地路径",
  uploading: "上传图片素材",
  replacing: "替换 Markdown 链接",
  done: "处理完成",
};

const inputClass =
  "h-[34px] min-w-0 flex-1 rounded-sm border border-border px-2.5 text-[13px] text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

export default function ImportMarkdownDialog({
  open,
  markdownPath,
  resourceRoot,
  progress,
  result,
  error,
  importing,
  onPickMarkdown,
  onPickResourceRoot,
  onStart,
  onClose,
}: Props) {
  const canStart = Boolean(markdownPath) && !importing;
  const totalUploaded = result ? result.uploadedLocal.length + result.uploadedRemote.length : 0;
  const totalFailed = result ? result.failed.length : 0;
  const totalUnsupported = result ? result.unsupported.length : 0;

  return (
    <Dialog
      open={open}
      title="导入 Markdown"
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {result ? "关闭" : "取消"}
          </Button>
          <Button type="button" variant="primary" onClick={onStart} disabled={!canStart}>
            {importing ? "导入中…" : result ? "重新导入" : "开始导入"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] leading-[1.7] text-text-secondary">
          选择 Markdown 文件后，会识别本地和在线图片，上传到公众号永久素材库并替换为微信素材链接。Obsidian 的 <code>![[...]]</code> 图片语法也会转换成标准 Markdown 图片。
        </p>
        <p className="m-0 text-xs leading-relaxed text-text-muted">
          导入成功后会在目录树当前位置新建同名文档（已存在则覆盖）并打开，不影响当前文档；视频会被识别但暂不自动上传。
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-text-secondary">Markdown 文件</div>
          <div className="flex gap-2">
            <input value={markdownPath} readOnly placeholder="请选择 .md 或 .markdown 文件" className={inputClass} />
            <Button type="button" variant="secondary" onClick={onPickMarkdown} disabled={importing}>
              选择文件
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-text-secondary">资源根目录（可选）</div>
          <div className="flex gap-2">
            <input value={resourceRoot} readOnly placeholder="Obsidian 附件较分散时选择 vault 或附件目录" className={inputClass} />
            <Button type="button" variant="secondary" onClick={onPickResourceRoot} disabled={importing}>
              选择目录
            </Button>
          </div>
        </div>

        {progress && (
          <div style={statusStyle}>
            <div>{phaseText[progress.phase] || progress.phase}</div>
            {typeof progress.total === "number" && (
              <div className="text-text-muted">进度 {progress.completed || 0} / {progress.total}</div>
            )}
            {progress.current && <div style={pathStyle}>{progress.current}</div>}
          </div>
        )}

        {error && <div className="rounded-sm border border-danger/30 bg-danger/5 p-2.5 text-xs leading-relaxed text-danger">{error}</div>}

        {result && (
          <div style={statusStyle}>
            <div style={{fontWeight: 600, marginBottom: 6}}>导入结果</div>
            <div>共识别 {result.totalRefs} 个媒体引用，成功上传 {totalUploaded} 张图片。</div>
            <div>本地图片 {result.uploadedLocal.length}，在线图片 {result.uploadedRemote.length}，失败 {totalFailed}，未处理 {totalUnsupported}。</div>
            {totalFailed > 0 && <DetailList title="失败项" items={result.failed} />}
            {totalUnsupported > 0 && <DetailList title="未处理项" items={result.unsupported} />}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function DetailList({title, items}: {title: string; items: Array<{originalUrl: string; reason?: string}>}) {
  return (
    <details style={{marginTop: 8}}>
      <summary style={{cursor: "pointer"}}>{title}</summary>
      <ul style={{margin: "6px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto"}}>
        {items.slice(0, 20).map((item, index) => (
          <li key={`${item.originalUrl}-${index}`} style={{lineHeight: 1.5}}>
            <span className="text-text-secondary">{item.originalUrl}</span>
            {item.reason && <span className="text-text-muted"> — {item.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

const statusStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  borderRadius: 6,
  padding: 10,
  fontSize: 12,
  color: "var(--text)",
  lineHeight: 1.6,
};

const pathStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
