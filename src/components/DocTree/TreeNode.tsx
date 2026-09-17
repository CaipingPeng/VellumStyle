import {memo, useEffect, useState, type MouseEvent} from "react";
import {ChevronRight, Folder, FileText, FolderOpen, Copy, Pencil, Trash2, FilePlus, FolderPlus} from "lucide-react";
import {AnimatePresence, motion} from "framer-motion";
import type {DocNode} from "../../utils/documents.ts";
import {MOTION_DURATION_FAST, MOTION_DURATION_MEDIUM, MOTION_EASE_SMOOTH} from "../../utils/motion.ts";
import DraftInput from "./DraftInput.tsx";
import type {RenameSession} from "./renameSession.ts";

export interface CreatingState {
  mode: "doc" | "folder";
  dir: string; // 目标父目录（相对 documents/，"" = 根）
  value: string;
  error?: string | null;
  pending?: boolean;
}

interface Props {
  node: DocNode;
  depth: number;
  selectedPath: string | null; // 统一选中源（文件或文件夹），高亮唯一项
  sidebarFocused: boolean; // 侧栏是否聚焦（决定活跃/失焦配色）
  expanded: Set<string>;
  dragOverPath: string | null;
  dragSrcPath?: string | null; // 拖拽中的源节点（视觉淡化），无拖拽时省略
  creating: CreatingState | null;
  // 重命名会话统一下发：所有节点都能看到"当前有会话 + 目标是哪个路径"，
  // 命中路径的节点高亮自己（输入本身在 RenameDialog 里完成，行内不再放输入框）。
  renameSession: {path: string; session: RenameSession} | null;
  onToggle: (path: string) => void;
  onSelectDoc: (path: string) => void; // 点文档：选中并打开到编辑器
  onSelectFolder: (path: string) => void; // 点文件夹：仅选中（+展开），不打开文件
  onStartRename: (node: DocNode) => void;
  onDelete: (node: DocNode) => void;
  onOpenLocation: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
  onCreateIn: (dir: string, mode: "doc" | "folder") => void;
  onDragStartNode: (path: string) => void;
  onDragOverNode: (path: string | null) => void;
  onDropNode: (destDir: string) => void;
  onDraftChange: (v: string) => void;
  onDraftCommit: () => void;
  onDraftCancel: () => void;
}

function TreeNode({
  node, depth, selectedPath, sidebarFocused, expanded, dragOverPath, dragSrcPath, creating, renameSession,
  onToggle, onSelectDoc, onSelectFolder, onStartRename,
  onDelete, onOpenLocation, onCopyAbsolutePath, onCreateIn, onDragStartNode, onDragOverNode, onDropNode,
  onDraftChange, onDraftCommit, onDraftCancel,
}: Props) {
  // 命中会话目标路径的节点高亮自己；输入在 RenameDialog 弹层里完成。
  const renaming = renameSession !== null && renameSession.path === node.path;
  const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
  const isOpen = node.isDir && expanded.has(node.path);
  const selected = selectedPath === node.path; // 文件/文件夹一视同仁
  const dropTarget = node.isDir && dragOverPath === node.path;
  const isDragSource = dragSrcPath === node.path;

  // 选中样式：选中（文件/文件夹一视同仁）用 accent-subtle 底 + accent 字；
  // 改名中的行用虚线圈出，让弹层与树上的目标对得上；未选中悬停淡灰底。
  void sidebarFocused;
  const rowTone = renaming
    ? "bg-accent-subtle text-accent"
    : selected
      ? "bg-accent-subtle text-accent"
      : dropTarget
        ? "bg-accent-subtle text-text"
        : "text-text hover:bg-bg-tertiary";
  const actionTone = selected || dropTarget || renaming ? "bg-accent-subtle" : "bg-bg-tertiary";
  // 文件夹行 hover 时除重命名/删除外还显示「新建文档/新建文件夹」，操作区更宽，标题让位更多。
  const hoverLabelPadding = node.isDir ? "group-hover:pr-20" : "group-hover:pr-12";
  const hoverActionMaxWidth = node.isDir ? "group-hover:max-w-20" : "group-hover:max-w-12";

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
    if (renaming) return;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 80)),
    });
  };

  return (
    <div>
      <div
        title={node.name}
        aria-label={node.name}
        draggable={!renaming}
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
          if (renaming) return; // 改名弹层打开时，树上的点击不改变选中
          if (node.isDir) {
            // 文件夹：仅选中 + 展开/收起，不打开任何文件。
            onSelectFolder(node.path);
            onToggle(node.path);
            return;
          }
          onSelectDoc(node.path);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // 文件和文件夹均使用双击进入重命名；文件夹展开/收起仍由单击负责。
          if (renaming) return;
          onStartRename(node);
        }}
        className={`group relative flex h-7 cursor-pointer items-center gap-1 overflow-hidden pr-1.5 text-sm2 transition-[color,background-color,transform] duration-fast active:scale-[0.985] ${isDragSource ? "opacity-50" : ""} ${rowTone}`}
        style={{
          paddingLeft: 8 + depth * 14,
          outline: dropTarget ? "1px dashed var(--accent)" : renaming ? "1px dashed var(--accent)" : "none",
          outlineOffset: -1,
        }}
      >
        {node.isDir ? (
          <motion.span
            initial={false}
            animate={{rotate: isOpen ? 90 : 0}}
            transition={{duration: MOTION_DURATION_FAST, ease: MOTION_EASE_SMOOTH}}
            style={{display: "inline-flex", flexShrink: 0}}
          >
            <ChevronRight size={14} />
          </motion.span>
        ) : (
          <span style={{width: 14, flexShrink: 0}} />
        )}
        {node.isDir ? <Folder size={14} /> : <FileText size={14} />}
        <span className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap transition-[padding] duration-fast ${hoverLabelPadding}`}>
          {node.name}
        </span>
        {!renaming && (
          <span
            className={`pointer-events-none absolute inset-y-0 right-0 flex max-w-0 items-center gap-1 overflow-hidden pl-2 pr-1.5 opacity-0 transition-[max-width,opacity] duration-fast group-hover:pointer-events-auto ${hoverActionMaxWidth} group-hover:opacity-100 ${actionTone}`}
          >
            <button
              type="button"
              title="重命名"
              className="flex flex-shrink-0 items-center justify-center border-0 bg-transparent p-0"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename(node);
              }}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              title="删除"
              className="flex flex-shrink-0 items-center justify-center border-0 bg-transparent p-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
            >
              <Trash2 size={13} />
            </button>
            {node.isDir && (
              <>
                <button
                  type="button"
                  title="新建文档"
                  className="flex flex-shrink-0 items-center justify-center border-0 bg-transparent p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateIn(node.path, "doc");
                  }}
                >
                  <FilePlus size={13} />
                </button>
                <button
                  type="button"
                  title="新建文件夹"
                  className="flex flex-shrink-0 items-center justify-center border-0 bg-transparent p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateIn(node.path, "folder");
                  }}
                >
                  <FolderPlus size={13} />
                </button>
              </>
            )}
          </span>
        )}
      </div>
      {contextMenu && (
        <div
          className="fixed z-[1900] min-w-[160px] overflow-hidden rounded-sm border border-border bg-bg py-1 shadow-lg"
          style={{left: contextMenu.x, top: contextMenu.y}}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-sm2 text-text outline-none transition-colors duration-fast hover:bg-bg-tertiary focus-visible:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]"
            onClick={() => {
              setContextMenu(null);
              onStartRename(node);
            }}
          >
            <Pencil size={14} />
            重命名
          </button>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-sm2 text-text outline-none transition-colors duration-fast hover:bg-bg-tertiary focus-visible:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]"
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
            className="flex h-8 w-full items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-sm2 text-text outline-none transition-colors duration-fast hover:bg-bg-tertiary focus-visible:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]"
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
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: "auto"}}
            exit={{opacity: 0, height: 0}}
            transition={{duration: MOTION_DURATION_MEDIUM, ease: MOTION_EASE_SMOOTH}}
            className="overflow-hidden"
          >
            {/* 草稿输入行：本文件夹是新建目标时，在子项最前占位显示 */}
            {creating && creating.dir === node.path && (
              <DraftInput
                mode={creating.mode}
                depth={depth + 1}
                value={creating.value}
                error={creating.error ?? null}
                pending={creating.pending ?? false}
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
                dragSrcPath={dragSrcPath}
                creating={creating}
                renameSession={renameSession}
                onToggle={onToggle}
                onSelectDoc={onSelectDoc}
                onSelectFolder={onSelectFolder}
                onStartRename={onStartRename}
                onDelete={onDelete}
                onOpenLocation={onOpenLocation}
                onCopyAbsolutePath={onCopyAbsolutePath}
                onCreateIn={onCreateIn}
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

// memo：仅当节点自身 props 变化时重渲染。回调由 DocTree 侧 useCallback 稳定化，
// 聚焦、面板宽度调整、App 无关重渲染不再整树重建。
// 注意：会话必须以 {path, session} 形式下发给**所有**节点。若只在命中节点上挂 rename，
// 祖先节点会被浅比较判定"props 未变"而跳过渲染，嵌套节点永远拿不到会话（改名完全无反应）。
export default memo(TreeNode);
