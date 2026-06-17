import type {ReactNode} from "react";
import type {ImportMarkdownProgress, ImportMarkdownResult} from "../../utils/markdownImport.ts";
import {CheckCircle2, FileText, FolderOpen, Loader2, Play, RotateCcw} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  markdownPaths: string[];
  resourceRoot: string;
  showResourceRoot: boolean;
  progress: ImportMarkdownProgress | null;
  result: ImportMarkdownResult | null;
  error: string;
  importing: boolean;
  onPickMarkdown: () => void;
  onPickResourceRoot: () => void;
  onToggleResourceRoot: (checked: boolean) => void;
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

const fieldShellClass =
  "group flex min-h-[46px] items-center overflow-hidden rounded-md bg-[#f7f8fb] " +
  "shadow-[inset_0_0_0_1px_rgba(26,26,30,0.055),inset_0_1px_0_rgba(255,255,255,0.92)] " +
  "transition-[background,box-shadow] duration-fast ease-smooth " +
  "hover:bg-[#f4f6fa] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(94,106,210,0.22),0_0_0_3px_rgba(94,106,210,0.09),0_8px_22px_rgba(20,20,30,0.055)]";

const inputClass =
  "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-1 text-[13px] leading-none text-text shadow-none outline-none " +
  "placeholder:text-text-muted";

const pickerButtonClass =
  "mr-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-white px-3 " +
  "text-[13px] font-medium text-text shadow-[0_1px_2px_rgba(20,20,30,0.08),inset_0_1px_0_rgba(255,255,255,0.94)] " +
  "cursor-pointer transition-[background,box-shadow,transform,color] duration-fast ease-smooth " +
  "hover:bg-[#fbfbfd] hover:text-accent hover:shadow-[0_6px_18px_rgba(20,20,30,0.08),inset_0_1px_0_rgba(255,255,255,0.96)] " +
  "active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:opacity-50 disabled:shadow-none disabled:hover:text-text";

const headerOptionClass =
  "inline-flex min-h-6 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 " +
  "text-xs font-medium text-text-muted transition-[background,color] duration-fast ease-smooth " +
  "hover:bg-[#f3f4f8] hover:text-text";

const footerButtonBase =
  "inline-flex h-9 min-w-[88px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 px-4 " +
  "text-[13px] font-semibold leading-none cursor-pointer transition-[background,box-shadow,transform,color] duration-fast ease-smooth " +
  "active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:translate-y-0 disabled:opacity-50";

const footerGhostButton =
  footerButtonBase +
  " bg-[#f3f4f8] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] hover:bg-[#eaecf3] hover:text-text";

const footerPrimaryButton =
  footerButtonBase +
  " bg-accent text-white shadow-[0_10px_24px_rgba(94,106,210,0.24),inset_0_1px_0_rgba(255,255,255,0.22)] " +
  "hover:bg-accent-hover hover:shadow-[0_12px_28px_rgba(94,106,210,0.30),inset_0_1px_0_rgba(255,255,255,0.24)] " +
  "disabled:bg-[#c7cadf] disabled:shadow-none";

export default function ImportMarkdownDialog({
  open,
  markdownPaths,
  resourceRoot,
  showResourceRoot,
  progress,
  result,
  error,
  importing,
  onPickMarkdown,
  onPickResourceRoot,
  onToggleResourceRoot,
  onStart,
  onClose,
}: Props) {
  const canStart = markdownPaths.length > 0 && !importing;
  const markdownValue = formatMarkdownSelection(markdownPaths);
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
          <button type="button" className={footerGhostButton} onClick={onClose}>
            {result ? "关闭" : "取消"}
          </button>
          <button type="button" className={footerPrimaryButton} onClick={onStart} disabled={!canStart}>
            {importing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                导入中...
              </>
            ) : result ? (
              <>
                <RotateCcw size={14} />
                重新导入
              </>
            ) : (
              <>
                <Play size={14} />
                开始导入
              </>
            )}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-[#f8f9fc] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
          <p className="m-0 text-[13px] leading-[1.7] text-text-secondary">
            选择一个或多个 Markdown 文件后，会识别本地和在线图片，上传到公众号永久素材库并替换为微信素材链接。Obsidian 的 <code>![[...]]</code> 图片语法也会转换成标准 Markdown 图片。
          </p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-text-muted">
            导入成功后会在目录树当前位置为每个文件新建同名文档（已存在则覆盖）并打开最后一个导入文档；视频会被识别但暂不自动上传。
          </p>
        </div>

        <FieldPicker
          label="Markdown 文件"
          hint={markdownPaths.length > 1 ? `已选 ${markdownPaths.length} 个` : ".md / .markdown"}
          value={markdownValue}
          placeholder="请选择一个或多个 Markdown 文件"
          icon={<FileText size={16} />}
          buttonIcon={<FileText size={14} />}
          buttonLabel="选择文件"
          disabled={importing}
          onClick={onPickMarkdown}
          headerAction={
            <label className={headerOptionClass}>
              <input
                type="checkbox"
                checked={showResourceRoot}
                disabled={importing}
                onChange={(event) => onToggleResourceRoot(event.currentTarget.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-default"
              />
              手动指定资源目录
            </label>
          }
        />

        {showResourceRoot && (
          <FieldPicker
            label="资源根目录"
            hint="可选"
            value={resourceRoot}
            placeholder="Obsidian 附件较分散时选择 vault 或附件目录"
            icon={<FolderOpen size={16} />}
            buttonIcon={<FolderOpen size={14} />}
            buttonLabel="选择目录"
            disabled={importing}
            onClick={onPickResourceRoot}
          />
        )}

        {progress && (
          <div className={statusClass}>
            <div className="flex items-center gap-2 font-semibold text-text">
              {progress.phase === "done" ? (
                <CheckCircle2 size={14} className="text-success" />
              ) : (
                <Loader2 size={14} className="animate-spin text-accent" />
              )}
              {phaseText[progress.phase] || progress.phase}
            </div>
            {typeof progress.total === "number" && (
              <div className="text-text-muted">进度 {progress.completed || 0} / {progress.total}</div>
            )}
            {progress.current && <div className={pathClass}>{progress.current}</div>}
          </div>
        )}

        {error && <div className="rounded-md bg-danger/10 px-3.5 py-3 text-xs leading-relaxed text-danger shadow-[inset_0_0_0_1px_rgba(229,72,77,0.14)]">{error}</div>}

        {result && (
          <div className={statusClass}>
            <div className="mb-1.5 flex items-center gap-2 font-semibold text-text">
              <CheckCircle2 size={14} className="text-success" />
              导入结果
            </div>
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

function formatMarkdownSelection(paths: string[]): string {
  if (paths.length === 0) return "";
  if (paths.length === 1) return paths[0];
  return `${paths[0]} 等 ${paths.length} 个文件`;
}

function FieldPicker({
  label,
  hint,
  value,
  placeholder,
  icon,
  buttonIcon,
  buttonLabel,
  disabled,
  onClick,
  headerAction,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  icon: ReactNode;
  buttonIcon: ReactNode;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
  headerAction?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-semibold text-text">{label}</div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-xs text-text-muted">{hint}</div>
          {headerAction}
        </div>
      </div>
      <div className={fieldShellClass}>
        <div className="flex h-full w-11 flex-none items-center justify-center text-text-muted transition-colors duration-fast group-focus-within:text-accent">
          {icon}
        </div>
        <input value={value} readOnly placeholder={placeholder} className={inputClass} />
        <button type="button" className={pickerButtonClass} onClick={onClick} disabled={disabled}>
          {buttonIcon}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function DetailList({title, items}: {title: string; items: Array<{originalUrl: string; reason?: string}>}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer">{title}</summary>
      <ul className="mt-1.5 max-h-[120px] overflow-auto pl-[18px]">
        {items.slice(0, 20).map((item, index) => (
          <li key={`${item.originalUrl}-${index}`} className="leading-normal">
            <span className="text-text-secondary">{item.originalUrl}</span>
            {item.reason && <span className="text-text-muted"> — {item.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

const statusClass =
  "rounded-md bg-[#f8f9fc] px-3.5 py-3 text-xs leading-relaxed text-text " +
  "shadow-[inset_0_0_0_1px_rgba(26,26,30,0.05),inset_0_1px_0_rgba(255,255,255,0.94)]";
const pathClass = "overflow-hidden text-ellipsis whitespace-nowrap text-text-muted";
