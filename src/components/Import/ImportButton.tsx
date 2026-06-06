import {useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import ImportMarkdownDialog from "./ImportMarkdownDialog.tsx";
import {useStore} from "../../store/index.ts";
import {importMarkdownFile, type ImportMarkdownProgress, type ImportMarkdownResult} from "../../utils/markdownImport.ts";

export default function ImportButton() {
  const setContent = useStore((state) => state.setContent);
  const [openDialog, setOpenDialog] = useState(false);
  const [markdownPath, setMarkdownPath] = useState("");
  const [resourceRoot, setResourceRoot] = useState("");
  const [progress, setProgress] = useState<ImportMarkdownProgress | null>(null);
  const [result, setResult] = useState<ImportMarkdownResult | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

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
      setContent(next.content);
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "导入失败";
      setError(msg === "NOT_CONFIGURED" ? "尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。" : msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpenDialog(true)} style={buttonStyle}>
        导入
      </button>
      {openDialog && (
        <ImportMarkdownDialog
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
      )}
    </>
  );
}

const buttonStyle: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  fontSize: 13,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  background: "#fff",
  color: "#333",
  cursor: "pointer",
};
