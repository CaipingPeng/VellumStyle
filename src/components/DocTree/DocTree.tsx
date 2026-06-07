import {useState} from "react";
import {FilePlus, FolderPlus} from "lucide-react";
import {useStore} from "../../store/index.ts";
import type {DocNode} from "../../utils/documents.ts";
import TreeNode from "./TreeNode.tsx";
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
  const selectedFolderPath = useStore((s) => s.selectedFolderPath);
  const openDocument = useStore((s) => s.openDocument);
  const setSelectedFolder = useStore((s) => s.setSelectedFolder);
  const actions = useDocActions();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<null | "doc" | "folder">(null);
  const [draft, setDraft] = useState("");
  const [dragSrc, setDragSrc] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // 新建落点：优先选中文件夹，否则当前文档所在文件夹，再否则根。
  const targetDir = (): string => {
    if (selectedFolderPath) return selectedFolderPath;
    const cur = currentDocPath;
    if (!cur) return "";
    const slash = cur.lastIndexOf("/");
    return slash === -1 ? "" : cur.slice(0, slash);
  };

  const commitCreate = async () => {
    const name = draft.trim();
    const mode = creating;
    setCreating(null);
    setDraft("");
    if (!name || !mode) return;
    if (mode === "doc") await actions.newDocument(targetDir(), name);
    else await actions.newFolder(targetDir(), name);
  };

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
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid #e8e8e8",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{display: "flex", gap: 4, padding: 8, borderBottom: "1px solid #e8e8e8"}}>
        <button type="button" title="新建文档" onClick={() => {setCreating("doc"); setDraft("");}}
          style={btnStyle}><FilePlus size={15} /></button>
        <button type="button" title="新建文件夹" onClick={() => {setCreating("folder"); setDraft("");}}
          style={btnStyle}><FolderPlus size={15} /></button>
      </div>

      {/* 根区域：点空白取消选中文件夹；拖拽释放到此移到根目录 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingTop: 4,
          background: rootDragOver ? "#eef5fc" : undefined,
        }}
        onClick={() => setSelectedFolder(null)}
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
        {creating && (
          <div style={{padding: "4px 8px"}}>
            <input
              autoFocus
              placeholder={creating === "doc" ? "文档名" : "文件夹名"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitCreate()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitCreate();
                if (e.key === "Escape") {setCreating(null); setDraft("");}
              }}
              onClick={(e) => e.stopPropagation()}
              style={{width: "100%", fontSize: 13, boxSizing: "border-box"}}
            />
          </div>
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
              currentPath={currentDocPath}
              selectedFolder={selectedFolderPath}
              expanded={expanded}
              dragOverPath={dragOverPath}
              onToggle={toggle}
              onSelect={openDocument}
              onSelectFolder={setSelectedFolder}
              onRename={actions.rename}
              onDelete={handleDelete}
              onDragStartNode={setDragSrc}
              onDragOverNode={setDragOverPath}
              onDropNode={handleDrop}
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
