import type {ReactNode} from "react";
import {FileText, FolderOpen, Loader2, Play} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  markdownPaths: string[];
  resourceRoot: string;
  showResourceRoot: boolean;
  error: string;
  importing: boolean;
  onPickMarkdown: () => void;
  onPickResourceRoot: () => void;
  onToggleResourceRoot: (checked: boolean) => void;
  onStart: () => void;
  onClose: () => void;
}

const fieldShellClass =
  "group flex min-h-[46px] items-center overflow-hidden rounded-md bg-bg-secondary " +
  "shadow-[inset_0_0_0_1px_rgba(26,26,30,0.055),inset_0_1px_0_rgba(255,255,255,0.92)] " +
  "transition-[background,box-shadow] duration-fast ease-smooth " +
  "hover:bg-bg-tertiary focus-within:bg-bg focus-within:shadow-[inset_0_0_0_1px_rgba(94,106,210,0.22),0_0_0_3px_rgba(94,106,210,0.09),0_8px_22px_rgba(20,20,30,0.055)]";

const inputClass =
  "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-1 text-[13px] leading-none text-text shadow-none outline-none " +
  "placeholder:text-text-muted";

const pickerButtonClass =
  "mr-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-bg px-3 " +
  "text-[13px] font-medium text-text shadow-[0_1px_2px_rgba(80,66,40,0.08),inset_0_1px_0_rgba(255,255,255,0.94)] " +
  "cursor-pointer transition-[background,box-shadow,transform,color] duration-fast ease-smooth " +
  "hover:bg-bg-tertiary hover:text-accent hover:shadow-[0_6px_18px_rgba(80,66,40,0.08),inset_0_1px_0_rgba(255,255,255,0.96)] " +
  "active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:opacity-50 disabled:shadow-none disabled:hover:text-text";

const headerOptionClass =
  "inline-flex min-h-6 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 " +
  "text-xs font-medium text-text-muted transition-[background,color] duration-fast ease-smooth " +
  "hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

const footerButtonBase =
  "inline-flex h-9 min-w-[88px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 px-4 " +
  "text-[13px] font-semibold leading-none cursor-pointer transition-[background,box-shadow,transform,color] duration-fast ease-smooth " +
  "active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:translate-y-0 disabled:opacity-50";

const footerGhostButton =
  footerButtonBase +
  " bg-bg-tertiary text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] hover:bg-bg hover:text-text";

const footerPrimaryButton =
  footerButtonBase +
  " vs-btn-accent text-white shadow-[0_10px_24px_rgba(109,90,230,0.26),inset_0_1px_0_rgba(255,255,255,0.22)] " +
  "hover:shadow-[0_12px_28px_rgba(139,92,246,0.34),inset_0_1px_0_rgba(255,255,255,0.24)] " +
  "disabled:opacity-40 disabled:shadow-none";

export default function ImportMarkdownDialog({
  open,
  markdownPaths,
  resourceRoot,
  showResourceRoot,
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

  return (
    <Dialog
      open={open}
      title="导入 Markdown"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className={footerGhostButton} onClick={onClose}>
            取消
          </button>
          <button type="button" className={footerPrimaryButton} onClick={onStart} disabled={!canStart}>
            {importing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                导入中...
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
        <div className="rounded-md bg-bg-secondary px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
          <p className="m-0 text-[13px] leading-[1.7] text-text-secondary">
            选择一个或多个 Markdown 文件后会立即创建并打开文章，图片将在后台上传到公众号永久素材库。Obsidian 的 <code>![[...]]</code> 图片语法也会在上传成功后转换为标准 Markdown 图片。
          </p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-text-muted">
            后台图片任务不会阻塞编辑；视频会被识别但暂不自动上传。
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

        {error && <div className="rounded-md bg-danger/10 px-3.5 py-3 text-xs leading-relaxed text-danger shadow-[inset_0_0_0_1px_rgba(229,72,77,0.14)]">{error}</div>}
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
