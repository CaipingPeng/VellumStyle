import {forwardRef, useImperativeHandle, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {FileInput} from "lucide-react";
import ImportMarkdownDialog from "./ImportMarkdownDialog.tsx";
import {useStore} from "../../store/index.ts";
import {createDocument, writeDocument, targetDirFor, treeHasPath} from "../../utils/documents.ts";
import {importMarkdownFile, type ImportMarkdownProgress, type ImportMarkdownResult} from "../../utils/markdownImport.ts";
import {toast} from "../Toast/toast.ts";
import Button, {type ButtonVariant} from "../ui/Button.tsx";

// 从源文件绝对路径取文件名（去目录、去扩展名）。兼容 Windows 反斜杠。
function docNameFromPath(p: string): string {
  const base = p.split(/[\\/]/).pop() || "导入文档";
  return base.replace(/\.(md|markdown)$/i, "") || "导入文档";
}

interface Props {
  variant?: ButtonVariant;
  showTrigger?: boolean;
}

export interface ImportButtonHandle {
  open: () => void;
}

const ImportButton = forwardRef<ImportButtonHandle, Props>(
  ({variant = "secondary", showTrigger = true}, ref) => {
    const tree = useStore((s) => s.tree);
    const selectedPath = useStore((s) => s.selectedPath);
    const loadTree = useStore((s) => s.loadTree);
    const openDocument = useStore((s) => s.openDocument);
    const [openDialog, setOpenDialog] = useState(false);
    const [markdownPaths, setMarkdownPaths] = useState<string[]>([]);
    const [resourceRoot, setResourceRoot] = useState("");
    const [showResourceRoot, setShowResourceRoot] = useState(false);
    const [progress, setProgress] = useState<ImportMarkdownProgress | null>(null);
    const [result, setResult] = useState<ImportMarkdownResult | null>(null);
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);

    useImperativeHandle(ref, () => ({open: () => setOpenDialog(true)}), []);

    const pickMarkdown = async () => {
      const selected = await invoke<string[] | null>("pick_markdown_files");
      if (Array.isArray(selected) && selected.length > 0) {
        setMarkdownPaths(selected);
        setResult(null);
        setError("");
      }
    };

    const pickResourceRoot = async () => {
      const selected = await invoke<string | null>("pick_resource_dir");
      if (typeof selected === "string") {
        setResourceRoot(selected);
        setResult(null);
        setError("");
      }
    };

    const toggleResourceRoot = (checked: boolean) => {
      setShowResourceRoot(checked);
      if (!checked) setResourceRoot("");
      setResult(null);
      setError("");
    };

    const startImport = async () => {
      if (markdownPaths.length === 0 || importing) return;
      setImporting(true);
      setError("");
      setResult(null);
      try {
        const dir = targetDirFor(tree, selectedPath);
        const importedTargets = new Set<string>();
        const manualResourceRoot = showResourceRoot ? resourceRoot || null : null;
        let needsImportReview = false;
        let newPath = "";
        let lastName = "";

        for (const [index, markdownPath] of markdownPaths.entries()) {
          if (markdownPaths.length > 1) {
            setProgress({
              phase: "reading",
              current: `(${index + 1}/${markdownPaths.length}) ${markdownPath}`,
              completed: index,
              total: markdownPaths.length,
            });
          }

          const next = await importMarkdownFile(
            {markdownPath, resourceRoot: manualResourceRoot},
            setProgress,
          );
          setResult(next);
          needsImportReview = needsImportReview || next.failed.length > 0 || next.unsupported.length > 0;

          // 不覆盖当前文档：在目录树落点新建（或覆盖）同名文档并打开。
          const name = docNameFromPath(next.markdownPath);
          const target = dir ? `${dir}/${name}.md` : `${name}.md`;
          if (treeHasPath(tree, target) || importedTargets.has(target)) {
            await writeDocument(target, next.content);
            newPath = target;
          } else {
            newPath = await createDocument(dir, name);
            await writeDocument(newPath, next.content);
          }
          importedTargets.add(newPath);
          lastName = name;
        }

        await loadTree();
        if (newPath) await openDocument(newPath);
        toast.show(
          markdownPaths.length > 1 ? `已导入 ${markdownPaths.length} 个 Markdown 文件` : `已导入到「${lastName}」`,
          "info",
        );
        if (!needsImportReview) {
          setOpenDialog(false);
        }
      } catch (e) {
        const msg = typeof e === "string" ? e : (e as Error)?.message || "导入失败";
        setError(msg === "NOT_CONFIGURED" ? "尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。" : msg);
      } finally {
        setImporting(false);
      }
    };

    return (
      <>
        {showTrigger && (
          <Button variant={variant} onClick={() => setOpenDialog(true)}>
            <FileInput size={14} />
            导入
          </Button>
        )}
        <ImportMarkdownDialog
          open={openDialog}
          markdownPaths={markdownPaths}
          resourceRoot={resourceRoot}
          showResourceRoot={showResourceRoot}
          progress={progress}
          result={result}
          error={error}
          importing={importing}
          onPickMarkdown={pickMarkdown}
          onPickResourceRoot={pickResourceRoot}
          onToggleResourceRoot={toggleResourceRoot}
          onStart={startImport}
          onClose={() => setOpenDialog(false)}
        />
      </>
    );
  },
);

ImportButton.displayName = "ImportButton";

export default ImportButton;
