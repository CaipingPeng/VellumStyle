import {useState} from "react";
import {Code2, Download, FileImage, FileText, Loader2} from "lucide-react";
import {useStore} from "../../store/index.ts";
import {exportArticle, getExportFormatMeta, type ExportFormat} from "../../utils/exportArticle.ts";
import Button, {type ButtonVariant} from "../ui/Button.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import {toast} from "../Toast/toast.ts";

const EXPORT_ITEMS: Array<{
  format: ExportFormat;
  icon: typeof FileImage;
  label: string;
}> = [
  {format: "png", icon: FileImage, label: "PNG 长图"},
  {format: "pdf", icon: FileText, label: "PDF"},
  {format: "html", icon: Code2, label: "HTML"},
];

export interface ExportController {
  exporting: ExportFormat | null;
  runExport: (format: ExportFormat) => Promise<void>;
}

interface ExportButtonProps {
  controller?: ExportController;
  variant?: ButtonVariant;
}

export function useExportController(): ExportController {
  const currentDocPath = useStore((s) => s.currentDocPath);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const runExport = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    try {
      const result = await exportArticle(format, currentDocPath);
      if (result.status !== "cancelled") {
        const fileName = result.path?.split(/[\\/]/).pop() || result.fileName;
        const action = result.status === "saved" ? "已导出" : "已下载";
        toast.show(`${action}${getExportFormatMeta(format).label}：${fileName}`);
      }
    } catch (error) {
      console.error("导出失败：", error);
      const message = error instanceof Error ? error.message : "请检查预览内容后重试";
      toast.show(`导出失败：${message}`, "error", 4000);
    } finally {
      setExporting(null);
    }
  };

  return {exporting, runExport};
}

export function ExportMenuItems({controller, onSelect}: {controller: ExportController; onSelect?: () => void}) {
  return (
    <>
      {EXPORT_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <MenuItem
            key={item.format}
            onClick={() => {
              onSelect?.();
              void controller.runExport(item.format);
            }}
          >
            <Icon size={14} />
            {item.label}
          </MenuItem>
        );
      })}
    </>
  );
}

export default function ExportButton({controller: controlledController, variant = "secondary"}: ExportButtonProps) {
  const internalController = useExportController();
  const controller = controlledController ?? internalController;
  const [open, setOpen] = useState(false);
  const {exporting} = controller;
  const exportingLabel = exporting ? "导出中…" : "导出";
  const TriggerIcon = exporting ? Loader2 : Download;

  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      minWidth={144}
      align="end"
      trigger={
        <Button
          variant={variant}
          disabled={exporting !== null}
          onClick={() => setOpen((value) => !value)}
          className={variant === "toolbar" ? "" : "w-[92px]"}
        >
          <TriggerIcon size={14} className={exporting ? "animate-spin" : ""} />
          {exportingLabel}
        </Button>
      }
    >
      <ExportMenuItems controller={controller} onSelect={() => setOpen(false)} />
    </Menu>
  );
}
