import type {OutlineItem} from "../../utils/outline.ts";

interface Props {
  items: OutlineItem[];
  activeLine: number | null;
  onJump: (line: number) => void;
}

function countLabel(count: number): string {
  return `${count} 项`;
}

export default function OutlineNav({items, activeLine, onJump}: Props) {
  return (
    <aside className="flex w-[220px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-bg-tertiary">
      <div className="flex h-[47px] items-center justify-between border-b border-border px-3">
        <span className="text-[13px] font-medium text-text">大纲</span>
        <span className="text-xs tabular-nums text-text-muted">{countLabel(items.length)}</span>
      </div>

      {items.length === 0 ? (
        <div className="p-4 text-xs leading-relaxed text-text-muted">当前文档暂无标题</div>
      ) : (
        <nav className="flex-1 overflow-y-auto py-1" aria-label="当前文档大纲">
          {items.map((item) => {
            const active = activeLine === item.line;
            const tone = active
              ? "bg-accent-subtle text-accent"
              : "text-text-secondary hover:bg-bg-tertiary hover:text-text";
            return (
              <button
                key={item.id}
                type="button"
                title={item.text}
                className={`group flex h-7 w-full cursor-pointer items-center gap-2 border-0 bg-transparent pr-2 text-left text-[13px] outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)] ${tone}`}
                style={{paddingLeft: 8 + (item.level - 1) * 14}}
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
  );
}
