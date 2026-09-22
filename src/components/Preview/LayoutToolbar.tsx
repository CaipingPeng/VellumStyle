import {useStore} from "../../store/index.ts";

export default function LayoutToolbar() {
  const undo = useStore((s) => s.layoutUndo.length);
  const redo = useStore((s) => s.layoutRedo.length);
  const action = useStore.getState;
  return <div className="flex flex-none flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-xs">
    <span className="text-text-muted">点击预览调整同类文字 · 仅当前文章</span>
    <button type="button" disabled={!undo} onClick={() => action().undoLayout()}>撤销排版</button>
    <button type="button" disabled={!redo} onClick={() => action().redoLayout()}>重做排版</button>
  </div>;
}
