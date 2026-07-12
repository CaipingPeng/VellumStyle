import type {ReactNode, RefObject} from "react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import SyntaxToolbar from "../Toolbar/SyntaxToolbar.tsx";

interface EditorWorkspacePanelProps {
  editorRef: RefObject<MarkdownEditorHandle>;
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenMaterialLibrary: () => void;
  children: ReactNode;
}

export default function EditorWorkspacePanel({
  editorRef,
  onPickFile,
  onPickLocal,
  onOpenMaterialLibrary,
  children,
}: EditorWorkspacePanelProps) {
  return (
    <section
      aria-label="Markdown 编辑器"
      data-workspace-panel="editor"
      className="workspace-panel workspace-editor-panel flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div
        role="toolbar"
        aria-label="编辑器工具栏"
        data-editor-toolbar
        className="flex min-h-10 flex-none items-center overflow-x-auto border-b border-border px-2"
      >
        <SyntaxToolbar
          editorRef={editorRef}
          onPickFile={onPickFile}
          onPickLocal={onPickLocal}
          onOpenMaterialLibrary={onOpenMaterialLibrary}
        />
      </div>
      <div data-editor-content className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {children}
      </div>
    </section>
  );
}
