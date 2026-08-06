import {AlertTriangle, Trash2} from "lucide-react";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  count: number;
  kind?: "image" | "video";
  deleting: boolean;
  completed: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function kindLabel(kind: NonNullable<Props["kind"]>): string {
  return kind === "video" ? "视频" : "图片";
}

export default function DeleteMaterialConfirmDialog({
  open,
  count,
  kind = "image",
  deleting,
  completed,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={16} className="text-danger" />
          删除永久{kindLabel(kind)}素材
        </span>
      }
      onClose={onCancel}
      closeDisabled={deleting}
      closeOnOverlay={!deleting}
      width={480}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={deleting} onClick={onCancel}>取消</Button>
          <Button
            type="button"
            variant="ghost"
            state={deleting ? "loading" : "idle"}
            loadingText={`正在删除 ${completed}/${count}`}
            className="text-danger hover:bg-danger/10"
            onClick={onConfirm}
          >
            <Trash2 size={14} />
            永久删除 {count} {kind === "video" ? "个视频" : "张图片"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-6 text-text-secondary">
        <p>此操作将从微信公众号永久素材库中删除所选的 {count} {kind === "video" ? "个视频" : "张图片"}，删除后无法撤销。</p>
        <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-danger">
          此操作可能使引用了待删除图片、但尚未发表且仅停留在草稿箱中的文章图片失效。
        </p>
      </div>
    </Dialog>
  );
}
