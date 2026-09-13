import {Folder, FileText} from "lucide-react";

interface Props {
  mode: "doc" | "folder";
  depth: number;
  value: string;
  error?: string | null;
  pending?: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// 树中 inline 占位输入行：新建文件/文件夹时按目标层级缩进显示，带对应图标。
// 视觉与重命名输入框（RenameInput）对齐：同高度/缩进/图标占位/错误行。
export default function DraftInput({
  mode, depth, value, error = null, pending = false, onChange, onCommit, onCancel,
}: Props) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          paddingLeft: 8 + depth * 14,
          paddingRight: 6,
          fontSize: 13,
        }}
      >
        <span style={{width: 14, flexShrink: 0}} />
        {mode === "folder" ? <Folder size={14} /> : <FileText size={14} />}
        <input
          autoFocus
          value={value}
          disabled={pending}
          placeholder={mode === "doc" ? "文档名" : "文件夹名"}
          aria-label={mode === "doc" ? "新建文档名" : "新建文件夹名"}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          className={`flex-1 min-w-0 px-1 text-sm2 border rounded-sm bg-transparent outline-none focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60 ${
            error ? "border-danger" : "border-border focus:border-accent"
          }`}
        />
      </div>
      {error && (
        <div style={{paddingLeft: 8 + depth * 14 + 18 + 4}}>
          <div className="truncate pb-0.5 pl-1.5 pr-2 text-xs2 leading-4 text-danger" role="alert">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
