import {useState} from "react";
import {ChevronRight, ChevronDown, Folder, FileText, Pencil, Trash2} from "lucide-react";
import type {DocNode} from "../../utils/documents.ts";

interface Props {
  node: DocNode;
  depth: number;
  currentPath: string | null;
  selectedFolder: string | null;
  expanded: Set<string>;
  dragOverPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onDragStartNode: (path: string) => void;
  onDragOverNode: (path: string | null) => void;
  onDropNode: (destDir: string) => void;
}

export default function TreeNode({
  node, depth, currentPath, selectedFolder, expanded, dragOverPath,
  onToggle, onSelect, onSelectFolder, onRename, onDelete,
  onDragStartNode, onDragOverNode, onDropNode,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [hover, setHover] = useState(false);
  const isOpen = node.isDir && expanded.has(node.path);
  const selectedDoc = !node.isDir && currentPath === node.path;
  const selectedDir = node.isDir && selectedFolder === node.path;
  const dropTarget = node.isDir && dragOverPath === node.path;

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };

  return (
    <div>
      <div
        draggable={!editing}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStartNode(node.path);
        }}
        onDragOver={(e) => {
          if (node.isDir) {
            e.preventDefault();
            e.stopPropagation();
            onDragOverNode(node.path);
          }
        }}
        onDragLeave={() => {
          if (node.isDir && dragOverPath === node.path) onDragOverNode(null);
        }}
        onDrop={(e) => {
          if (node.isDir) {
            e.preventDefault();
            e.stopPropagation();
            onDropNode(node.path);
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => {
          if (node.isDir) {
            onToggle(node.path);
            onSelectFolder(node.path);
          } else {
            onSelect(node.path);
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
          background: selectedDoc
            ? "#1e6bb8"
            : dropTarget
              ? "#cfe3f7"
              : selectedDir
                ? "#e6f0fa"
                : hover
                  ? "#f0f2f5"
                  : "transparent",
          color: selectedDoc ? "#fff" : "#333",
          outline: dropTarget ? "1px dashed #1e6bb8" : "none",
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
            selectedFolder={selectedFolder}
            expanded={expanded}
            dragOverPath={dragOverPath}
            onToggle={onToggle}
            onSelect={onSelect}
            onSelectFolder={onSelectFolder}
            onRename={onRename}
            onDelete={onDelete}
            onDragStartNode={onDragStartNode}
            onDragOverNode={onDragOverNode}
            onDropNode={onDropNode}
          />
        ))}
    </div>
  );
}
