import {useState} from "react";
import {ChevronRight, ChevronDown, Folder, FileText, Pencil, Trash2} from "lucide-react";
import type {DocNode} from "../../utils/documents.ts";
import DraftInput from "./DraftInput.tsx";

export interface CreatingState {
  mode: "doc" | "folder";
  dir: string; // 目标父目录（相对 documents/，"" = 根）
  value: string;
}

interface Props {
  node: DocNode;
  depth: number;
  selectedPath: string | null; // 统一选中源（文件或文件夹），高亮唯一项
  sidebarFocused: boolean; // 侧栏是否聚焦（决定活跃/失焦配色）
  expanded: Set<string>;
  dragOverPath: string | null;
  creating: CreatingState | null;
  onToggle: (path: string) => void;
  onSelectDoc: (path: string) => void; // 点文档：选中并打开到编辑器
  onSelectFolder: (path: string) => void; // 点文件夹：仅选中（+展开），不打开文件
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onDragStartNode: (path: string) => void;
  onDragOverNode: (path: string | null) => void;
  onDropNode: (destDir: string) => void;
  onDraftChange: (v: string) => void;
  onDraftCommit: () => void;
  onDraftCancel: () => void;
}

export default function TreeNode({
  node, depth, selectedPath, sidebarFocused, expanded, dragOverPath, creating,
  onToggle, onSelectDoc, onSelectFolder, onRename, onDelete,
  onDragStartNode, onDragOverNode, onDropNode,
  onDraftChange, onDraftCommit, onDraftCancel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [hover, setHover] = useState(false);
  const isOpen = node.isDir && expanded.has(node.path);
  const selected = selectedPath === node.path; // 文件/文件夹一视同仁
  const dropTarget = node.isDir && dragOverPath === node.path;

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };

  // 选中样式：活跃（侧栏聚焦）实蓝白字；失焦浅灰深字。文件与文件夹相同。
  const selectedBg = sidebarFocused ? "#1e6bb8" : "#d6dde4";
  const selectedColor = sidebarFocused ? "#fff" : "#333";

  return (
    <div>
      <div
        draggable={!editing}
        onDragStart={(e) => {
          e.stopPropagation();
          // 必须写 dataTransfer，否则 WebView2 视为无效拖拽（光标显示禁止符）。
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.path);
          onDragStartNode(node.path);
        }}
        onDragOver={(e) => {
          // 对所有节点 preventDefault 才能让浏览器允许 drop（否则光标禁止符）。
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          // 只有文件夹是有效落点，高亮它；拖到文档上不高亮（释放时按其所在目录处理）。
          if (node.isDir) onDragOverNode(node.path);
          else onDragOverNode(null);
        }}
        onDragLeave={() => {
          if (node.isDir && dragOverPath === node.path) onDragOverNode(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // 拖到文件夹：移进该文件夹。拖到文档：移进该文档所在目录（同级）。
          if (node.isDir) {
            onDropNode(node.path);
          } else {
            const slash = node.path.lastIndexOf("/");
            onDropNode(slash === -1 ? "" : node.path.slice(0, slash));
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (node.isDir) {
            // 文件夹：仅选中 + 展开/收起，不打开任何文件。
            onSelectFolder(node.path);
            onToggle(node.path);
          } else {
            onSelectDoc(node.path);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          paddingLeft: 8 + depth * 14,
          paddingRight: 6,
          cursor: "pointer",
          fontSize: 13,
          background: selected
            ? selectedBg
            : dropTarget
              ? "#cfe3f7"
              : hover
                ? "#f0f2f5"
                : "transparent",
          color: selected ? selectedColor : "#333",
          outline: dropTarget ? "1px dashed #1e6bb8" : "none",
          outlineOffset: -1,
        }}
      >
        {node.isDir ? (
          isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{width: 14, flexShrink: 0}} />
        )}
        {node.isDir ? <Folder size={14} /> : <FileText size={14} />}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(node.name);
              }
            }}
            style={{flex: 1, fontSize: 13, minWidth: 0}}
          />
        ) : (
          <span style={{flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {node.name}
          </span>
        )}
        {hover && !editing && (
          <>
            <Pencil
              size={13}
              style={{flexShrink: 0}}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(node.name);
                setEditing(true);
              }}
            />
            <Trash2
              size={13}
              style={{flexShrink: 0}}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.path);
              }}
            />
          </>
        )}
      </div>
      {isOpen && (
        <>
          {/* 草稿输入行：本文件夹是新建目标时，在子项最前占位显示 */}
          {creating && creating.dir === node.path && (
            <DraftInput
              mode={creating.mode}
              depth={depth + 1}
              value={creating.value}
              onChange={onDraftChange}
              onCommit={onDraftCommit}
              onCancel={onDraftCancel}
            />
          )}
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              sidebarFocused={sidebarFocused}
              expanded={expanded}
              dragOverPath={dragOverPath}
              creating={creating}
              onToggle={onToggle}
              onSelectDoc={onSelectDoc}
              onSelectFolder={onSelectFolder}
              onRename={onRename}
              onDelete={onDelete}
              onDragStartNode={onDragStartNode}
              onDragOverNode={onDragOverNode}
              onDropNode={onDropNode}
              onDraftChange={onDraftChange}
              onDraftCommit={onDraftCommit}
              onDraftCancel={onDraftCancel}
            />
          ))}
        </>
      )}
    </div>
  );
}
