import {Folder, FileText} from "lucide-react";

interface Props {
  mode: "doc" | "folder";
  depth: number;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// 树中 inline 占位输入行：新建文件/文件夹时按目标层级缩进显示，带对应图标。
// 视觉与 TreeNode 行对齐（同高度/缩进/图标占位）。
export default function DraftInput({mode, depth, value, onChange, onCommit, onCancel}: Props) {
  return (
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
        placeholder={mode === "doc" ? "文档名" : "文件夹名"}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 min-w-0 px-1 text-[13px] border border-border rounded-sm bg-transparent outline-none focus:border-accent"
      />
    </div>
  );
}
