import {useEffect, useMemo, useRef, useState} from "react";
import {Command, Search} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import {filterCommands, type AppCommand} from "../../commands/registry.ts";

interface Props {
  commands: readonly AppCommand[];
  onClose: () => void;
}

export default function CommandPalette({commands, onClose}: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);
  useEffect(() => {
    // 部分 WebView 的 scrollIntoView 会返回 Promise；副作用不能把它返回给 React，
    // 否则 StrictMode 卸载检查会将 Promise 当作清理函数调用并导致整个界面崩溃。
    activeRef.current?.scrollIntoView?.({block: "nearest"});
  }, [activeIndex]);

  const execute = (command: AppCommand) => {
    onClose();
    void Promise.resolve(command.run()).catch((error) => console.error("执行命令失败：", error));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(filtered[Math.min(activeIndex, filtered.length - 1)]);
    }
  };

  return (
    <Dialog open title={<span className="flex items-center gap-2"><Command size={16} />命令面板</span>} onClose={onClose} width={620} contentPadding={false} initialFocusRef={inputRef}>
      <div className="flex h-[min(520px,70vh)] min-h-0 flex-col">
        <label className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Search size={17} className="text-text-muted" aria-hidden="true" />
          <span className="sr-only">搜索命令</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或功能名称"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded-sm border border-border bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">Esc</kbd>
        </label>
        <div id="command-palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">没有匹配的命令</div>
          ) : filtered.map((command, index) => (
            <button
              key={command.id}
              id={`command-${command.id}`}
              ref={index === activeIndex ? activeRef : undefined}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => execute(command)}
              className={`flex min-h-10 w-full items-center gap-3 rounded-sm border-0 px-3 text-left outline-none transition-colors ${
                index === activeIndex ? "bg-accent-subtle text-text" : "bg-transparent text-text-secondary hover:bg-bg-tertiary"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{command.label}</span>
              <span className="text-xs text-text-muted">{command.group}</span>
              {command.shortcut && <kbd className="min-w-[62px] text-right text-[11px] text-text-muted">{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-[11px] text-text-muted">
          <span>↑↓ 选择　Enter 执行</span>
          <span>Ctrl+Shift+P</span>
        </div>
      </div>
    </Dialog>
  );
}
