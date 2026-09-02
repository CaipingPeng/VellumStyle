import {memo} from "react";
import type {OutlineItem} from "../../utils/outline.ts";
import ResizableSidePanel from "../Workspace/ResizableSidePanel.tsx";

interface Props {
  items: OutlineItem[];
  activeLine: number | null;
  onJump: (line: number) => void;
}

function countLabel(count: number): string {
  return `${count} 项`;
}

function OutlineNav({items, activeLine, onJump}: Props) {
  const minLevel = items.length > 0 ? Math.min(...items.map((item) => item.level)) : 1;

  return (
    <ResizableSidePanel ariaLabel="调整大纲宽度">
      <aside className="workspace-panel workspace-outline-panel flex w-full flex-shrink-0 flex-col overflow-hidden">
        <div className="flex h-[42px] flex-none items-center justify-between border-b border-border px-3">
          <span className="text-sm2 font-medium text-text">大纲</span>
          <span className="text-xs tabular-nums text-text-muted">{countLabel(items.length)}</span>
        </div>

        {items.length === 0 ? (
          <div className="p-4 text-xs leading-relaxed text-text-muted">当前文档暂无标题</div>
        ) : (
          <nav className="flex-1 overflow-y-auto py-1" aria-label="当前文档大纲">
            {items.map((item, index) => {
              const active = activeLine === item.line;
              const tone = active
                ? "bg-accent-subtle text-accent"
                : "text-text-secondary hover:bg-bg-tertiary hover:text-text";
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.text}
                  className={`group flex h-7 w-full cursor-pointer items-center gap-2 border-0 bg-transparent pr-2 text-left text-sm2 outline-none transition-[color,background-color,transform] duration-fast active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)] vs-rise ${tone}`}
                  style={{
                    paddingLeft: 8 + (item.level - minLevel) * 14,
                    // 抽屉打开/文档切换时阶梯淡入（一次性动画，见 .vs-rise）
                    animationDelay: `${Math.min(index * 18, 270)}ms`,
                  }}
                  aria-current={active ? "location" : undefined}
                  onClick={() => onJump(item.line)}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 flex-none rounded-full ${active ? "bg-accent" : "bg-text-muted/50 group-hover:bg-text-secondary"}`}
                  />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.text}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </aside>
    </ResizableSidePanel>
  );
}

export default memo(OutlineNav);
