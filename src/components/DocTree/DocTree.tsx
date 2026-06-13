import {useEffect, useState} from "react";
import {FilePlus, FolderPlus} from "lucide-react";
import {motion} from "framer-motion";
import {useStore} from "../../store/index.ts";
import {ancestorDirsForPath, targetDirFor, type DocNode} from "../../utils/documents.ts";
import TreeNode, {type CreatingState} from "./TreeNode.tsx";
import DraftInput from "./DraftInput.tsx";
import IconButton from "../ui/IconButton.tsx";
import {useDocActions} from "./useDocActions.ts";

// 取树里第一篇文档路径（深度优先），删当前文档后回退用。
function firstDocPath(nodes: DocNode[]): string | null {
  for (const n of nodes) {
    if (!n.isDir) return n.path;
    const inChild = firstDocPath(n.children);
    if (inChild) return inChild;
  }
  return null;
}

export default function DocTree() {
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

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

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

  // 开始新建：算目标目录，展开它（非根才需要），显示占位输入行。
  const startCreate = (mode: "doc" | "folder") => {
    const dir = targetDir();
    if (dir) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(dir);
        return next;
      });
    }
    setCreating({mode, dir, value: ""});
  };

  const commitCreate = async () => {
    if (!creating) return;
    const {mode, dir, value} = creating;
    const name = value.trim();
    setCreating(null);
    if (!name) return;
    if (mode === "doc") await actions.newDocument(dir, name);
    else await actions.newFolder(dir, name);
  };

  const draftChange = (v: string) =>
    setCreating((c) => (c ? {...c, value: v} : c));

  const handleDelete = (path: string) => {
    if (!window.confirm("确定删除？")) return;
    void actions.remove(path, firstDocPath(tree));
  };

  const handleDrop = (destDir: string) => {
    const src = dragSrc;
    setDragSrc(null);
    setDragOverPath(null);
    setRootDragOver(false);
    if (!src) return;
    void actions.move(src, destDir);
  };

  return (
    <div
      tabIndex={-1}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="flex w-[220px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-bg-tertiary outline-none"
    >
      <div className="flex gap-1 p-2 border-b border-border">
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
            onCommit={() => void commitCreate()}
            onCancel={() => setCreating(null)}
          />
        )}
        {tree.length === 0 && !creating ? (
          <div className="p-4 text-xs leading-relaxed text-text-muted">
            点击上方 + 新建第一篇文档
          </div>
        ) : (
          tree.map((node, i) => (
            <motion.div
              key={node.path}
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.16, delay: i * 0.02, ease: [0.16, 1, 0.3, 1]}}
            >
              <TreeNode
                node={node}
                depth={0}
                selectedPath={selectedPath}
                sidebarFocused={focused}
                expanded={expanded}
                dragOverPath={dragOverPath}
                creating={creating}
                onToggle={toggle}
                onSelectDoc={openDocument}
                onSelectFolder={setSelectedPath}
                onRename={actions.rename}
                onDelete={handleDelete}
                onDragStartNode={setDragSrc}
                onDragOverNode={setDragOverPath}
                onDropNode={handleDrop}
                onDraftChange={draftChange}
                onDraftCommit={() => void commitCreate()}
                onDraftCancel={() => setCreating(null)}
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
