import {useStore} from "../../store/index.ts";
import {toast} from "../Toast/toast.ts";

export default function LayoutToolbar() {
  const enabled = useStore((s) => s.layoutMode);
  const undo = useStore((s) => s.layoutUndo.length);
  const redo = useStore((s) => s.layoutRedo.length);
  const action = useStore.getState;
  return <div className="flex flex-none flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-xs">
    <button type="button" aria-pressed={enabled} onClick={() => action().setLayoutMode(!enabled)}>{enabled ? "完成排版" : "调整排版"}</button>
    {enabled && <>
      <span className="text-text-muted">点击预览调整同类文字 · 仅当前文章</span>
      <button type="button" disabled={!undo} onClick={() => action().undoLayout()}>撤销排版</button>
      <button type="button" disabled={!redo} onClick={() => action().redoLayout()}>重做排版</button>
    </>}
    <button type="button" onClick={() => {action().saveLayoutAsDefault(); toast.show("已设为新文章默认排版，已有文章不变");}}>设为新文章默认</button>
  </div>;
}
