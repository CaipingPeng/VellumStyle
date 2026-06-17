import {useCallback, useLayoutEffect, useRef, useState, type RefObject} from "react";
import {Copy as CopyIcon, Download, FileInput, MoreHorizontal, Palette, Send, Settings} from "lucide-react";
import ImportButton, {type ImportButtonHandle} from "../Import/ImportButton.tsx";
import ThemeMenu, {type ThemeMenuHandle} from "../Theme/ThemeMenu.tsx";
import PublishButton from "../Publish/PublishButton.tsx";
import CopyButton from "../Copy/CopyButton.tsx";
import ExportButton, {ExportMenuItems, useExportController} from "../Export/ExportButton.tsx";
import Button from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import {SECONDARY_ACTIONS, type SecondaryAction} from "./toolbarActions.ts";
import {computeToolbarAvailableWidth, computeVisibleActionCount} from "./toolbarOverflow.ts";

interface Props {
  onOpenSettings: () => void;
  onNeedSettings: () => void;
}

const SECONDARY_ACTION_COUNT: number = SECONDARY_ACTIONS.length;
const MIN_LEFT_TOOLBAR_WIDTH = 30;

export default function MainToolbar({onOpenSettings, onNeedSettings}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SECONDARY_ACTION_COUNT);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<ImportButtonHandle>(null);
  const themeRef = useRef<ThemeMenuHandle>(null);
  const exportController = useExportController();

  const recalcVisible = useCallback(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    const header = wrap?.parentElement;
    if (!wrap || !measure || !header) return;

    const widthOf = (id: SecondaryAction | "publish" | "copy" | "more") =>
      measure.querySelector<HTMLElement>(`[data-measure="${id}"]`)?.getBoundingClientRect().width ?? 0;

    const headerStyle = window.getComputedStyle(header);
    const available = computeToolbarAvailableWidth({
      headerWidth: header.clientWidth,
      paddingLeft: parsePx(headerStyle.paddingLeft),
      paddingRight: parsePx(headerStyle.paddingRight),
      gap: parsePx(headerStyle.columnGap || headerStyle.gap),
      leftMinWidth: MIN_LEFT_TOOLBAR_WIDTH,
    });
    const secondaryWidths = SECONDARY_ACTIONS.map((id) => widthOf(id));
    const publishWidth = widthOf("publish");
    const copyWidth = widthOf("copy");
    const moreWidth = widthOf("more");

    const count = computeVisibleActionCount({
      availableWidth: available,
      secondaryWidths,
      primaryWidths: [publishWidth, copyWidth],
      moreWidth,
    });
    setVisibleCount(count);
    if (count === SECONDARY_ACTION_COUNT) setMoreOpen(false);
  }, []);

  useLayoutEffect(() => {
    recalcVisible();
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    const header = wrap?.parentElement;
    if (!wrap || !measure || !header || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", recalcVisible);
      return () => window.removeEventListener("resize", recalcVisible);
    }
    const observer = new ResizeObserver(recalcVisible);
    observer.observe(header);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [recalcVisible]);

  const visibleActions = SECONDARY_ACTIONS.slice(0, visibleCount);
  const hiddenActions = SECONDARY_ACTIONS.slice(visibleCount);
  const hasOverflow = hiddenActions.length > 0;
  const isVisible = (action: SecondaryAction) => visibleActions.includes(action);

  const closeMore = () => setMoreOpen(false);

  const runHiddenAction = (action: SecondaryAction) => {
    switch (action) {
      case "import":
        closeMore();
        importRef.current?.open();
        break;
      case "export":
        break;
      case "theme":
        closeMore();
        themeRef.current?.open();
        break;
      case "settings":
        closeMore();
        onOpenSettings();
        break;
    }
  };

  return (
    <div ref={wrapRef} className="relative flex min-w-0 max-w-full items-center justify-end gap-2">
      {isVisible("import") ? <ImportButton ref={importRef} variant="toolbar" /> : <ImportButton ref={importRef} showTrigger={false} />}
      {isVisible("export") && <ExportButton controller={exportController} variant="toolbar" />}
      {isVisible("theme") ? <ThemeMenu ref={themeRef} variant="toolbar" /> : <ThemeMenu ref={themeRef} showTrigger={false} />}
      {isVisible("settings") && (
        <IconButton title="设置" onClick={onOpenSettings} className="text-text-secondary hover:text-text">
          <Settings size={16} />
        </IconButton>
      )}
      <PublishButton onNeedSettings={onNeedSettings} />
      <CopyButton />
      {hasOverflow && (
        <Menu
          open={moreOpen}
          onClose={closeMore}
          minWidth={132}
          align="end"
          trigger={
            <IconButton title="更多" active={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <MoreHorizontal size={16} />
            </IconButton>
          }
        >
          {hiddenActions.map((action) => {
            return (
              action === "export" ? (
                <ExportMenuItems key={action} controller={exportController} onSelect={closeMore} />
              ) : (
                <MenuItem key={action} onClick={() => runHiddenAction(action)}>
                  {menuLabel(action)}
                </MenuItem>
              )
            );
          })}
        </Menu>
      )}
      <ToolbarMeasure measureRef={measureRef} />
    </div>
  );
}

function menuLabel(action: SecondaryAction) {
  switch (action) {
    case "import":
      return "导入";
    case "export":
      return "导出";
    case "theme":
      return "主题";
    case "settings":
      return "设置";
  }
}

function ToolbarMeasure({measureRef}: {measureRef: RefObject<HTMLDivElement>}) {
  return (
    <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[9999px] top-0 flex items-center gap-2">
      <div data-measure="import">
        <Button variant="toolbar"><FileInput size={14} />导入</Button>
      </div>
      <div data-measure="theme">
        <Button variant="toolbar"><Palette size={14} />主题</Button>
      </div>
      <div data-measure="settings">
        <IconButton title="设置"><Settings size={16} /></IconButton>
      </div>
      <div data-measure="export">
        <Button variant="secondary" className="w-[92px]"><Download size={14} />导出</Button>
      </div>
      <div data-measure="publish">
        <Button variant="primary"><Send size={14} />发布</Button>
      </div>
      <div data-measure="copy">
        <Button variant="primary"><CopyIcon size={14} />复制到微信</Button>
      </div>
      <div data-measure="more">
        <IconButton title="更多"><MoreHorizontal size={16} /></IconButton>
      </div>
    </div>
  );
}

function parsePx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
