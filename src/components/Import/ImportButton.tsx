import {forwardRef, useImperativeHandle, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {markdownTitle} from "../../utils/path.ts";
import {FileInput} from "lucide-react";
import ImportMarkdownDialog from "./ImportMarkdownDialog.tsx";
import {flushSave, useStore} from "../../store/index.ts";
import {createDocument, deleteEntry, writeDocument, targetDirFor} from "../../utils/documents.ts";
import {
  enqueueMarkdownImageImport,
  prepareMarkdownImport,
  type PreparedMarkdownImport,
} from "../../utils/markdownImport.ts";
import {toast} from "../Toast/toast.ts";
import Button, {type ButtonVariant} from "../ui/Button.tsx";

// 从源文件绝对路径取文件名（去目录、去扩展名）。兼容 Windows 反斜杠。
function docNameFromPath(p: string): string {
  return markdownTitle(p) || "导入文档";
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
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);

    useImperativeHandle(ref, () => ({open: () => setOpenDialog(true)}), []);

    const pickMarkdown = async () => {
      const selected = await invoke<string[] | null>("pick_markdown_files");
      if (Array.isArray(selected) && selected.length > 0) {
        setMarkdownPaths(selected);
        setError("");
      }
    };

    const pickResourceRoot = async () => {
      const selected = await invoke<string | null>("pick_resource_dir");
      if (typeof selected === "string") {
        setResourceRoot(selected);
        setError("");
      }
    };

    const toggleResourceRoot = (checked: boolean) => {
      setShowResourceRoot(checked);
      if (!checked) setResourceRoot("");
      setError("");
    };

    const startImport = async () => {
      if (markdownPaths.length === 0 || importing) return;
      setImporting(true);
      setError("");
      try {
        const dir = targetDirFor(tree, selectedPath);
        const manualResourceRoot = showResourceRoot ? resourceRoot || null : null;
        const backgroundJobs: Array<{prepared: PreparedMarkdownImport; documentPath: string}> = [];
        const preparedImports: PreparedMarkdownImport[] = [];
        const createdPaths: string[] = [];
        let newPath = "";
        let lastName = "";

        await flushSave();

        // 先把所有源文件读完；任一源文件失败时，不在文档目录留下半成品。
        for (const markdownPath of markdownPaths) {
          preparedImports.push(await prepareMarkdownImport({
            markdownPath,
            resourceRoot: manualResourceRoot,
          }));
        }

        try {
          for (const prepared of preparedImports) {
            // createDocument 会为已存在或批量重名的文章自动生成唯一名称。
            const name = docNameFromPath(prepared.markdownPath);
            newPath = await createDocument(dir, name);
            createdPaths.push(newPath);
            await writeDocument(newPath, prepared.content);
            backgroundJobs.push({prepared, documentPath: newPath});
            lastName = (newPath.split("/").pop() || name).replace(/\.md$/i, "");
          }
        } catch (error) {
          await Promise.allSettled(createdPaths.map((path) => deleteEntry(path)));
          throw error;
        }

        await loadTree();
        if (newPath) await openDocument(newPath);
        setOpenDialog(false);
        toast.show(
          markdownPaths.length > 1
            ? `已导入 ${markdownPaths.length} 个 Markdown 文件，图片将在后台处理`
            : `已导入到「${lastName}」，图片将在后台处理`,
          "info",
        );
        for (const job of backgroundJobs) {
          void enqueueMarkdownImageImport(job.prepared, job.documentPath).catch((reason) => {
            console.error("后台处理导入图片失败：", reason);
          });
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
