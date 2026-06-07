import {useState} from "react";
import {FilePlus, FolderPlus} from "lucide-react";
import {useStore} from "../../store/index.ts";
import type {DocNode} from "../../utils/documents.ts";
import TreeNode, {type CreatingState} from "./TreeNode.tsx";
import DraftInput from "./DraftInput.tsx";
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

// 在树里查某路径是否文件夹。
function isFolderPath(nodes: DocNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return n.isDir;
    if (n.isDir) {
      const r = isFolderPath(n.children, path);
      if (r) return true;
    }
  }
  return false;
}

export default function DocTree() {
  const tree = useStore((s) => s.tree);
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

  // 新建落点：选中项是文件夹→落其下；选中项是文件→落其同级目录；无选中→根。
  const targetDir = (): string => {
    const sel = selectedPath;
    if (!sel) return "";
    if (isFolderPath(tree, sel)) return sel;
    const slash = sel.lastIndexOf("/");
    return slash === -1 ? "" : sel.slice(0, slash);
  };

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
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid #e8e8e8",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        outline: "none",
      }}
    >
      <div style={{display: "flex", gap: 4, padding: 8, borderBottom: "1px solid #e8e8e8"}}>
        <button type="button" title="新建文档" onClick={() => startCreate("doc")}
          style={btnStyle}><FilePlus size={15} /></button>
        <button type="button" title="新建文件夹" onClick={() => startCreate("folder")}
          style={btnStyle}><FolderPlus size={15} /></button>
      </div>

      {/* 根区域：点空白取消选中；拖拽释放到此移到根目录 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingTop: 4,
          background: rootDragOver ? "#eef5fc" : undefined,
        }}
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
          <div style={{padding: 16, fontSize: 12, color: "#999", lineHeight: 1.6}}>
            点击上方 + 新建第一篇文档
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
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
          ))
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 28,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  color: "#333",
};
