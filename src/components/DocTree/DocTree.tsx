import {memo, useCallback, useEffect, useState} from "react";
import {FilePlus, FileText, FolderPlus} from "lucide-react";
import {motion} from "framer-motion";
import {useStore} from "../../store/index.ts";
import {MOTION_DURATION_MEDIUM, MOTION_EASE_SMOOTH, MOTION_STAGGER_STEP} from "../../utils/motion.ts";
import {ancestorDirsForPath, targetDirFor, type DocNode} from "../../utils/documents.ts";
import TreeNode, {type CreatingState} from "./TreeNode.tsx";
import DraftInput from "./DraftInput.tsx";
import IconButton from "../ui/IconButton.tsx";
import {useDocActions} from "./useDocActions.ts";
import {isRecursiveDelete} from "./deleteConfirmation.ts";
import DeleteConfirmDialog from "./DeleteConfirmDialog.tsx";
import ResizableSidePanel from "../Workspace/ResizableSidePanel.tsx";

// 取树里第一篇文档路径（深度优先），删当前文档后回退用。
function firstDocPath(nodes: DocNode[], excludedPath?: string): string | null {
  for (const n of nodes) {
    if (excludedPath && (n.path === excludedPath || n.path.startsWith(`${excludedPath}/`))) {
      continue;
    }
    if (!n.isDir) return n.path;
    const inChild = firstDocPath(n.children, excludedPath);
    if (inChild) return inChild;
  }
  return null;
}

// 按展开状态展平为可见节点列表（键盘导航用）。
function flattenVisible(nodes: DocNode[], expanded: Set<string>): Array<{path: string; isDir: boolean}> {
  const out: Array<{path: string; isDir: boolean}> = [];
  const walk = (list: DocNode[]) => {
    for (const n of list) {
      out.push({path: n.path, isDir: n.isDir});
      if (n.isDir && expanded.has(n.path)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function DocTree() {
  const tree = useStore((s) => s.tree);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const selectedPath = useStore((s) => s.selectedPath);
  const openDocument = useStore((s) => s.openDocument);
  const setSelectedPath = useStore((s) => s.setSelectedPath);
  const actions = useDocActions();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [dragSrc, setDragSrc] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocNode | null>(null);
  const [renameSignal, setRenameSignal] = useState<{path: string; token: number} | null>(null);

  // 稳定回调：配合 memo(TreeNode)，避免无关重渲染（聚焦、宽度调整等）重建整树。
  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!currentDocPath) return;

    if (useStore.getState().selectedPath !== currentDocPath) {
      setSelectedPath(currentDocPath);
    }

    const ancestorDirs = ancestorDirsForPath(currentDocPath);
    if (ancestorDirs.length === 0) return;

    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const dir of ancestorDirs) {
        if (!next.has(dir)) {
          next.add(dir);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentDocPath, setSelectedPath]);

  // 新建落点：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根。
  const targetDir = (): string => targetDirFor(tree, selectedPath);

  // 在指定目录开始新建：展开该目录（非根才需要），显示占位输入行。
  const startCreateIn = useCallback((dir: string, mode: "doc" | "folder") => {
    if (dir) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(dir);
        return next;
      });
    }
    setCreating({mode, dir, value: ""});
  }, []);

  // 顶部按钮新建：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根。
  const startCreate = useCallback((mode: "doc" | "folder") => startCreateIn(targetDir(), mode), [startCreateIn, selectedPath, tree]);

  // Windows 习惯：选中文件/文件夹后按 F2 直接重命名；方向键/回车做键盘导航。
  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // 只响应面板自身聚焦（避免输入框/按钮上的快捷键误触发）。
    if (event.target !== event.currentTarget) return;
    if (creating || event.repeat) return;

    if (event.key === "F2") {
      if (!selectedPath) return;
      event.preventDefault();
      setRenameSignal((prev) => ({path: selectedPath, token: (prev?.token ?? 0) + 1}));
      return;
    }

    const flat = flattenVisible(tree, expanded);
    if (flat.length === 0) return;
    const index = flat.findIndex((item) => item.path === selectedPath);
    const current = index >= 0 ? flat[index] : null;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = flat[Math.min(Math.max(index, -1) + 1, flat.length - 1)];
        if (next) setSelectedPath(next.path);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = flat[Math.max(index <= 0 ? 0 : index - 1, 0)];
        if (next) setSelectedPath(next.path);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (!current) break;
        if (current.isDir && !expanded.has(current.path)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.add(current.path);
            return next;
          });
        } else {
          // 文件夹已展开：进入第一个子节点；文件无操作。
          const child = flat[index + 1];
          if (child && current.isDir) setSelectedPath(child.path);
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (!current) break;
        if (current.isDir && expanded.has(current.path)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(current.path);
            return next;
          });
        } else {
          const slash = current.path.lastIndexOf("/");
          setSelectedPath(slash === -1 ? null : current.path.slice(0, slash));
        }
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (current && !current.isDir) {
          void openDocument(current.path);
        }
        break;
      }
    }
  };

  const commitCreate = useCallback(async () => {
    if (!creating) return;
    const {mode, dir, value} = creating;
    const name = value.trim();
    setCreating(null);
    if (!name) return;
    if (mode === "doc") await actions.newDocument(dir, name);
    else await actions.newFolder(dir, name);
  }, [actions, creating]);

  const draftChange = useCallback((v: string) => {
    setCreating((c) => (c ? {...c, value: v} : c));
  }, []);

  const handleDelete = useCallback((node: DocNode) => setPendingDelete(node), []);

  const cancelCreate = useCallback(() => setCreating(null), []);

  const confirmDelete = async () => {
    const node = pendingDelete;
    if (!node) return;
    setPendingDelete(null);
    await actions.remove(node.path, firstDocPath(tree, node.path), {recursive: isRecursiveDelete(node)});
  };

  const handleDrop = useCallback((destDir: string) => {
    const src = dragSrc;
    setDragSrc(null);
    setDragOverPath(null);
    setRootDragOver(false);
    if (!src) return;
    void actions.move(src, destDir);
  }, [actions, dragSrc]);

  const handleOpenLocation = useCallback((path: string) => {
    void actions.openLocation(path);
  }, [actions]);

  const handleCopyAbsolutePath = useCallback((path: string) => {
    void actions.copyAbsolutePath(path);
  }, [actions]);

  return (
    <>
      <ResizableSidePanel ariaLabel="调整文件树宽度">
        <div
          tabIndex={-1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerDown={(e) => {
            // 树行本身不可聚焦，点击任意位置都让面板拿到焦点，F2 才能落到面板。
            e.currentTarget.focus({preventScroll: true});
          }}
          onKeyDown={handlePanelKeyDown}
          className="workspace-panel workspace-documents-panel flex w-full flex-shrink-0 flex-col overflow-hidden outline-none"
        >
        <div className="flex h-[42px] flex-none items-center gap-1 border-b border-border px-2">
          <IconButton title="新建文档" onClick={() => startCreate("doc")}>
            <FilePlus size={15} />
          </IconButton>
          <IconButton title="新建文件夹" onClick={() => startCreate("folder")}>
            <FolderPlus size={15} />
          </IconButton>
        </div>

        {/* 根区域：点空白取消选中；拖拽释放到此移到根目录 */}
        <div
          className={`flex-1 overflow-y-auto pt-1${rootDragOver ? " bg-accent-subtle" : ""}`}
          onClick={() => setSelectedPath(null)}
          onDragOver={(e) => {
            e.preventDefault();
            setRootDragOver(true);
            setDragOverPath(null);
          }}
          onDragLeave={() => setRootDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop("");
          }}
        >
          {/* 根级草稿输入行 */}
          {creating && creating.dir === "" && (
            <DraftInput
              mode={creating.mode}
              depth={0}
              value={creating.value}
              onChange={draftChange}
              onCommit={commitCreate}
              onCancel={cancelCreate}
            />
          )}
          {tree.length === 0 && !creating ? (
            <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-tertiary text-text-muted">
                <FileText size={18} strokeWidth={1.6} />
              </div>
              <p className="text-xs leading-relaxed text-text-muted">
                点击上方 + 新建第一篇文档
              </p>
            </div>
          ) : (
            tree.map((node, i) => (
              <motion.div
                key={node.path}
                initial={{opacity: 0, y: 4}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: MOTION_DURATION_MEDIUM, delay: i * MOTION_STAGGER_STEP, ease: MOTION_EASE_SMOOTH}}
              >
                <TreeNode
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  sidebarFocused={focused}
                  expanded={expanded}
                  dragOverPath={dragOverPath}
                  dragSrcPath={dragSrc}
                  creating={creating}
                  onToggle={toggle}
                  onSelectDoc={openDocument}
                  onSelectFolder={setSelectedPath}
                  onRename={actions.rename}
                  onDelete={handleDelete}
                  onOpenLocation={handleOpenLocation}
                  onCopyAbsolutePath={handleCopyAbsolutePath}
                  onCreateIn={startCreateIn}
                  renameSignal={renameSignal}
                  onDragStartNode={setDragSrc}
                  onDragOverNode={setDragOverPath}
                  onDropNode={handleDrop}
                  onDraftChange={draftChange}
                  onDraftCommit={commitCreate}
                  onDraftCancel={cancelCreate}
                />
              </motion.div>
            ))
          )}
        </div>
        </div>
      </ResizableSidePanel>
      <DeleteConfirmDialog
        open={pendingDelete !== null}
        node={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

export default memo(DocTree);
