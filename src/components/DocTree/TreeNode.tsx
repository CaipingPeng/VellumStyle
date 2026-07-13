import {useEffect, useState, type MouseEvent} from "react";
import {ChevronRight, ChevronDown, Folder, FileText, FolderOpen, Copy, Pencil, Trash2} from "lucide-react";
import {AnimatePresence, motion} from "framer-motion";
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
  onDelete: (node: DocNode) => void;
  onOpenLocation: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
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
  onOpenLocation, onCopyAbsolutePath, onDragStartNode, onDragOverNode, onDropNode,
  onDraftChange, onDraftCommit, onDraftCancel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
  const isOpen = node.isDir && expanded.has(node.path);
  const selected = selectedPath === node.path; // 文件/文件夹一视同仁
  const dropTarget = node.isDir && dragOverPath === node.path;

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };

  // 选中样式：选中（文件/文件夹一视同仁）用 accent-subtle 底 + accent 字；
  // 拖拽落点同样用 accent-subtle 高亮；未选中悬停淡灰底。sidebarFocused 仍透传。
  void sidebarFocused;
  const rowTone = selected
    ? "bg-accent-subtle text-accent"
    : dropTarget
      ? "bg-accent-subtle text-text"
      : "text-text hover:bg-bg-tertiary";
  const actionTone = selected || dropTarget ? "bg-accent-subtle" : "bg-bg-tertiary";

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (editing) return;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 80)),
    });
  };

  return (
    <div>
      <div
        title={!editing ? node.name : undefined}
        aria-label={node.name}
        draggable={!editing}
        onContextMenu={openContextMenu}
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
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (node.isDir || editing) return;
          setDraft(node.name);
          setEditing(true);
        }}
        className={`group relative flex h-7 cursor-pointer items-center gap-1 overflow-hidden pr-1.5 text-[13px] transition-colors duration-fast ${rowTone}`}
        style={{
          paddingLeft: 8 + depth * 14,
          outline: dropTarget ? "1px dashed var(--accent)" : "none",
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
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap transition-[padding] duration-fast group-hover:pr-12">
            {node.name}
          </span>
        )}
        {!editing && (
          <span
            className={`pointer-events-none absolute inset-y-0 right-0 flex max-w-0 items-center gap-1 overflow-hidden pl-2 pr-1.5 opacity-0 transition-[max-width,opacity] duration-fast group-hover:pointer-events-auto group-hover:max-w-12 group-hover:opacity-100 ${actionTone}`}
          >
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
                onDelete(node);
              }}
            />
          </span>
        )}
      </div>
      {contextMenu && (
        <div
          className="fixed z-[70] min-w-[160px] overflow-hidden rounded-sm border border-border bg-bg py-1 shadow-lg"
          style={{left: contextMenu.x, top: contextMenu.y}}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
            onClick={() => {
              setContextMenu(null);
              onOpenLocation(node.path);
            }}
          >
            <FolderOpen size={14} />
            打开文件位置
          </button>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
            onClick={() => {
              setContextMenu(null);
              onCopyAbsolutePath(node.path);
            }}
          >
            <Copy size={14} />
            复制绝对路径
          </button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.12}}
          >
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
                onOpenLocation={onOpenLocation}
                onCopyAbsolutePath={onCopyAbsolutePath}
                onDragStartNode={onDragStartNode}
                onDragOverNode={onDragOverNode}
                onDropNode={onDropNode}
                onDraftChange={onDraftChange}
                onDraftCommit={onDraftCommit}
                onDraftCancel={onDraftCancel}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
