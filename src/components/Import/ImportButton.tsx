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
    const [markdownPath, setMarkdownPath] = useState("");
    const [resourceRoot, setResourceRoot] = useState("");
    const [progress, setProgress] = useState<ImportMarkdownProgress | null>(null);
    const [result, setResult] = useState<ImportMarkdownResult | null>(null);
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);

    useImperativeHandle(ref, () => ({open: () => setOpenDialog(true)}), []);

    const pickMarkdown = async () => {
      const selected = await invoke<string | null>("pick_markdown_file");
      if (typeof selected === "string") {
        setMarkdownPath(selected);
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

    const startImport = async () => {
      if (!markdownPath || importing) return;
      setImporting(true);
      setError("");
      setResult(null);
      try {
        const next = await importMarkdownFile(
          {markdownPath, resourceRoot: resourceRoot || null},
          setProgress,
        );
        setResult(next);

        // 不覆盖当前文档：在目录树落点新建（或覆盖）同名文档并打开。
        const name = docNameFromPath(next.markdownPath);
        const dir = targetDirFor(tree, selectedPath);
        const target = dir ? `${dir}/${name}.md` : `${name}.md`;
        let newPath: string;
        if (treeHasPath(tree, target)) {
          await writeDocument(target, next.content);
          newPath = target;
        } else {
          newPath = await createDocument(dir, name);
          await writeDocument(newPath, next.content);
        }
        await loadTree();
        await openDocument(newPath);
        toast.show(`已导入到「${name}」`, "info");
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
          markdownPath={markdownPath}
          resourceRoot={resourceRoot}
          progress={progress}
          result={result}
          error={error}
          importing={importing}
          onPickMarkdown={pickMarkdown}
          onPickResourceRoot={pickResourceRoot}
          onStart={startImport}
          onClose={() => setOpenDialog(false)}
        />
      </>
    );
  },
);

ImportButton.displayName = "ImportButton";

export default ImportButton;
