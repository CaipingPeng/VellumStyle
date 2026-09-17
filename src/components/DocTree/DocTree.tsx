import {memo, useCallback, useEffect, useRef, useState} from "react";
import {FilePlus, FileText, FolderPlus} from "lucide-react";
import {motion} from "framer-motion";
import {useStore} from "../../store/index.ts";
import {MOTION_DURATION_MEDIUM, MOTION_EASE_SMOOTH, MOTION_STAGGER_STEP} from "../../utils/motion.ts";
import {
  ancestorDirsForPath,
  entryBasename,
  entryStem,
  findSiblingConflict,
  findTreeNode,
  siblingPathsFor,
  targetDirFor,
  treePathAncestors,
  validateEntryName,
  type DocNode,
} from "../../utils/documents.ts";
import TreeNode, {type CreatingState} from "./TreeNode.tsx";
import DraftInput from "./DraftInput.tsx";
import RenameDialog from "./RenameDialog.tsx";
import {isUnchangedRename, renameInitialValue, type RenameSession} from "./renameSession.ts";
import IconButton from "../ui/IconButton.tsx";
import {remapExpandedPaths} from "./pathRemap.ts";
import {useDocActions} from "./useDocActions.ts";
import {isRecursiveDelete} from "./deleteConfirmation.ts";
import DeleteConfirmDialog from "./DeleteConfirmDialog.tsx";
import TrashDialog from "./TrashDialog.tsx";
import ResizableSidePanel from "../Workspace/ResizableSidePanel.tsx";
import {toast} from "../Toast/toast.ts";

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
  const [trashOpen, setTrashOpen] = useState(false);
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
  // 重命名会话：整棵树同一时刻只有一个节点处于编辑态。
  // 会话本身就是一次性事件，改完即销毁，不存在需要按 token 复位的“信号”残留。
  const [renameSession, setRenameSession] = useState<RenameSession | null>(null);
  // 提交走 ref 读取最新草稿：既保证 commitRename 引用稳定（TreeNode memo 生效），
  // 也避免在 setState 更新函数里做副作用。
  const renameSessionRef = useRef<RenameSession | null>(null);
  const updateRenameSession = useCallback((
    next: RenameSession | null | ((prev: RenameSession | null) => RenameSession | null),
  ) => {
    const resolved = typeof next === "function" ? next(renameSessionRef.current) : next;
    renameSessionRef.current = resolved;
    setRenameSession(resolved);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(0);

  // 稳定回调：配合 memo(TreeNode)，避免无关重渲染（聚焦、宽度调整等）重建整树。
  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const setExpandedPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const dir of paths) {
        if (!next.has(dir)) {
          next.add(dir);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!currentDocPath) return;

    if (useStore.getState().selectedPath !== currentDocPath) {
      setSelectedPath(currentDocPath);
    }

    setExpandedPaths(ancestorDirsForPath(currentDocPath));
  }, [currentDocPath, setSelectedPath, setExpandedPaths]);

  // 树数据每次刷新都会重建 DOM 行，滚动位置随之丢失；这里在往返前后恢复。
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = 0;
    scroller.scrollTop = top;
  }, [tree]);

  const rememberScroll = useCallback(() => {
    pendingScrollRef.current = scrollRef.current?.scrollTop ?? 0;
  }, []);

  // 新建落点：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根。
  const targetDir = (): string => targetDirFor(tree, selectedPath);

  // 在指定目录开始新建：展开该目录（非根才需要），显示占位输入行。
  const startCreateIn = useCallback((dir: string, mode: "doc" | "folder") => {
    setRenameSession(null); // 新建与重命名互斥，避免两个 inline 输入框同时占位
    if (dir) setExpandedPaths([dir]);
    setCreating({mode, dir, value: "", error: null, pending: false});
  }, [setExpandedPaths]);

  // 顶部按钮新建：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根。
  const startCreate = useCallback((mode: "doc" | "folder") => startCreateIn(targetDir(), mode), [startCreateIn, selectedPath, tree]);

  // 名称校验：非法字符/保留名/结尾点空格 + 同级重名。
  // 输入过程中与提交时都走这一份，用户在敲字时就能看到原因，而不是回车后才被拒。
  // 冲突检测同时比对「用户输入名」与「落盘名」：文件节点输入“素材”会保存成 素材.md，
  // 与同级文件夹“素材”在树里同名，必须在提交前拦下（Windows 上 explorer 也不允许）。
  const validateRenameDraft = useCallback((session: RenameSession, node: DocNode): string | null => {
    const name = session.value.trim();
    if (!name) return "名称不能为空";
    // 名字没变（文件节点只打主名也算没变）：视为无变化，交给提交路径静默收工。
    if (isUnchangedRename(node, name)) return null;
    const base = validateEntryName(name, node.name);
    if (base) return base;
    const dir = treePathAncestors(node.path).pop() ?? "";
    // 文件节点的显示名带 .md，用户敲的主名不带：两种形态都要比，
    // 否则“素材”这类与同级文件夹在树里完全同名的输入会漏到后端才报错。
    const candidates = node.isDir ? [name] : [name, ensureMdName(name)];
    const conflict = findSiblingConflict(siblingPathsFor(useStore.getState().tree, dir), candidates, node.path);
    return conflict ? `同级已有「${conflict}」` : null;
  }, []);

  // 进入重命名：校验交给会话，草稿初值 = 当前显示名。
  const startRenaming = useCallback((node: DocNode) => {
    setCreating(null);
    setSelectedPath(node.path);
    updateRenameSession({path: node.path, value: renameInitialValue(node), isDir: node.isDir, error: null, pending: false});
  }, [setSelectedPath, updateRenameSession]);

  const renameChange = useCallback((value: string) => {
    updateRenameSession((prev) => {
      if (!prev) return prev;
      const next: RenameSession = {...prev, value, error: null};
      const node = findTreeNode(useStore.getState().tree, prev.path);
      return node ? {...next, error: validateRenameDraft(next, node)} : next;
    });
  }, [updateRenameSession, validateRenameDraft]);

  const cancelRename = useCallback(() => {
    updateRenameSession(null);
  }, [updateRenameSession]);

  // 提交重命名：本地校验没过就保留会话 + 行内提示；后端失败也不销毁输入态。
  // blur 也走提交：用户点到别处视为“就这样改”，和资源管理器一致；取消请按 Esc。
  const commitRename = useCallback(async (source: "enter" | "blur") => {
    const session = renameSessionRef.current;
    if (!session) return;
    void source;
    const node = findTreeNode(useStore.getState().tree, session.path);
    if (!node) {
      updateRenameSession(null);
      return;
    }

    const name = session.value.trim();
    // 名字没变（文件节点只打主名也算没变）：静默收工，不打扰后端。
    if (!name || isUnchangedRename(node, name)) {
      updateRenameSession(null);
      return;
    }

    const invalid = validateRenameDraft(session, node);
    if (invalid) {
      updateRenameSession({...session, error: invalid, pending: false});
      return;
    }

    // 交给后端的仍是去掉扩展名的主体名，与新建流程保持一致。
    const submitted = node.isDir ? name : entryStem(ensureMdName(name));
    updateRenameSession({...session, error: null, pending: true});
    rememberScroll();
    const outcome = await actions.rename(node.path, submitted);
    if (outcome.ok) {
      updateRenameSession(null);
      // 文件夹改名后展开态要跟着迁移，否则整棵子树莫名收起。
      setExpanded((prev) => remapExpandedPaths(prev, outcome.oldPath, outcome.newPath, treePathAncestors(outcome.newPath)));
      toast.show(`已重命名为「${entryBasename(outcome.newPath)}」`);
    } else {
      // 后端拒绝（占用、权限、并发改名等）：保留输入态让用户改完重试。
      updateRenameSession((prev) => (prev
        ? {...prev, error: outcome.error ?? "重命名失败", pending: false}
        : prev));
    }
  }, [actions, setExpanded, updateRenameSession, validateRenameDraft, rememberScroll]);

  const handleRenameCommit = useCallback(() => {
    void commitRename("enter");
  }, [commitRename]);

  // Windows 习惯：选中文件/文件夹后按 F2 直接重命名；方向键/回车做键盘导航。
  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // 只响应面板自身聚焦（避免输入框/按钮上的快捷键误触发）。
    if (event.target !== event.currentTarget) return;
    if (creating || event.repeat) return;

    if (event.key === "F2") {
      if (!selectedPath) return;
      event.preventDefault();
      const node = findTreeNode(tree, selectedPath);
      if (!node) return;
      startRenaming(node);
      return;
    }

    if (renameSession) {
      // 会话期间方向键交给输入框内的光标移动（keydown 会冒泡到这里）。
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRename();
      }
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
    if (!name) {
      setCreating(null);
      return;
    }
    const invalid = validateEntryName(mode === "doc" ? ensureMdName(name) : name);
    if (invalid) {
      // 和重命名一致：非法名字保留输入态并给出原因，不静默丢弃用户输入。
      setCreating((current) => (current ? {...current, error: invalid} : current));
      return;
    }
    setCreating((current) => (current ? {...current, pending: true, error: null} : current));
    rememberScroll();
    if (mode === "doc") await actions.newDocument(dir, name);
    else await actions.newFolder(dir, name);
    setCreating(null);
  }, [actions, creating, rememberScroll]);

  const draftChange = useCallback((v: string) => {
    setCreating((c) => (c ? {...c, value: v, error: null} : c));
  }, []);

  const handleDelete = useCallback((node: DocNode) => setPendingDelete(node), []);

  const cancelCreate = useCallback(() => setCreating(null), []);

  const confirmDelete = async () => {
    const node = pendingDelete;
    if (!node) return;
    setPendingDelete(null);
    rememberScroll();
    await actions.remove(node.path, firstDocPath(tree, node.path), {recursive: isRecursiveDelete(node)});
  };

  const handleDrop = useCallback((destDir: string) => {
    const src = dragSrc;
    setDragSrc(null);
    setDragOverPath(null);
    setRootDragOver(false);
    if (!src) return;
    rememberScroll();
    void actions.move(src, destDir);
  }, [actions, dragSrc, rememberScroll]);

  const handleOpenLocation = useCallback((path: string) => {
    void actions.openLocation(path);
  }, [actions]);

  const handleCopyAbsolutePath = useCallback((path: string) => {
    void actions.copyAbsolutePath(path);
  }, [actions]);

  // memo(TreeNode) 只看浅比较：改名为嵌套节点时，祖先节点必须也能看到“会话已开始”，
  // 否则浅比较会判定 props 未变而跳过渲染，后代永远拿不到会话（表现为完全无反应）。
  // 因此把整个会话对象下发给所有节点，由各节点按 path 自行判断是否高亮。
  const renameForNodes = renameSession ? {path: renameSession.path, session: renameSession} : null;
  // 弹层需要的目标节点信息（名称/类型/路径都从会话目标实时取）。
  const renameTarget = renameSession ? findTreeNode(tree, renameSession.path) : null;

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
          <button type="button" className="ml-auto text-xs text-text-secondary" onClick={() => setTrashOpen(true)}>最近删除</button>
        </div>

        {/* 根区域：点空白取消选中；拖拽释放到此移到根目录 */}
        <div
          ref={scrollRef}
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
              error={creating.error ?? null}
              pending={creating.pending ?? false}
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
                  renameSession={renameForNodes}
                  onToggle={toggle}
                  onSelectDoc={openDocument}
                  onSelectFolder={setSelectedPath}
                  onStartRename={startRenaming}
                  onDelete={handleDelete}
                  onOpenLocation={handleOpenLocation}
                  onCopyAbsolutePath={handleCopyAbsolutePath}
                  onCreateIn={startCreateIn}
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
      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}
      <RenameDialog
        node={renameTarget}
        session={renameSession}
        onChange={renameChange}
        onCommit={handleRenameCommit}
        onCancel={cancelRename}
      />
    </>
  );
}

// 扩展名保护：文件节点提交时统一带 .md，用户误删也会补回来。
function ensureMdName(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

export default memo(DocTree);
