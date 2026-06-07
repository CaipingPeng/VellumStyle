import {useState} from "react";
import {ChevronRight, ChevronDown, Folder, FileText, Pencil, Trash2} from "lucide-react";
import type {DocNode} from "../../utils/documents.ts";

interface Props {
  node: DocNode;
  depth: number;
  currentPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
}

export default function TreeNode({
  node, depth, currentPath, expanded, onToggle, onSelect, onRename, onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [hover, setHover] = useState(false);
  const isOpen = node.isDir && expanded.has(node.path);
  const selected = !node.isDir && currentPath === node.path;

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          paddingLeft: 8 + depth * 14,
          paddingRight: 6,
          cursor: "pointer",
          fontSize: 13,
          background: selected ? "#1e6bb8" : hover ? "#f0f2f5" : "transparent",
          color: selected ? "#fff" : "#333",
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
      {isOpen &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            currentPath={currentPath}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
