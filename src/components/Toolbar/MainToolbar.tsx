import {useCallback, useLayoutEffect, useRef, useState, type RefObject} from "react";
import {Copy as CopyIcon, FileInput, ImageUp, MoreHorizontal, Palette, Send, Settings} from "lucide-react";
import UploadButton, {type UploadButtonHandle} from "../Upload/UploadButton.tsx";
import ImportButton, {type ImportButtonHandle} from "../Import/ImportButton.tsx";
import ThemeMenu, {type ThemeMenuHandle} from "../Theme/ThemeMenu.tsx";
import PreviewModeToggle from "../Preview/PreviewModeToggle.tsx";
import {PREVIEW_MODES, type PreviewModeId} from "../Preview/previewModes.ts";
import PublishButton from "../Publish/PublishButton.tsx";
import CopyButton from "../Copy/CopyButton.tsx";
import {useStore} from "../../store/index.ts";
import Button from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import {computeToolbarAvailableWidth, computeVisibleActionCount} from "./toolbarOverflow.ts";

interface Props {
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenSettings: () => void;
  onNeedSettings: () => void;
}

const SECONDARY_ACTIONS = ["upload", "import", "preview", "theme", "settings"] as const;
type SecondaryAction = (typeof SECONDARY_ACTIONS)[number];
const SECONDARY_ACTION_COUNT: number = SECONDARY_ACTIONS.length;
const MIN_LEFT_TOOLBAR_WIDTH = 30;

export default function MainToolbar({onPickFile, onPickLocal, onOpenSettings, onNeedSettings}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SECONDARY_ACTION_COUNT);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<UploadButtonHandle>(null);
  const importRef = useRef<ImportButtonHandle>(null);
  const themeRef = useRef<ThemeMenuHandle>(null);
  const previewMode = useStore((s) => s.previewMode);
  const setPreviewMode = useStore((s) => s.setPreviewMode);

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

  const pickPreviewMode = (mode: PreviewModeId) => {
    setPreviewMode(mode);
    closeMore();
  };

  const runHiddenAction = (action: SecondaryAction) => {
    switch (action) {
      case "upload":
        closeMore();
        void uploadRef.current?.pick();
        break;
      case "import":
        closeMore();
        importRef.current?.open();
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
      {isVisible("upload") ? (
        <UploadButton ref={uploadRef} variant="toolbar" onPickFile={onPickFile} onPickLocal={onPickLocal} />
      ) : (
        <UploadButton ref={uploadRef} showTrigger={false} onPickFile={onPickFile} onPickLocal={onPickLocal} />
      )}
      {isVisible("import") ? <ImportButton ref={importRef} variant="toolbar" /> : <ImportButton ref={importRef} showTrigger={false} />}
      {isVisible("preview") && <PreviewModeToggle />}
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
            if (action === "preview") {
              return PREVIEW_MODES.map((mode) => (
                <MenuItem key={mode.id} onClick={() => pickPreviewMode(mode.id)}>
                  <span className="w-4 text-center">{previewMode === mode.id ? "✓" : ""}</span>
                  {mode.label}
                </MenuItem>
              ));
            }
            return (
              <MenuItem key={action} onClick={() => runHiddenAction(action)}>
                {menuLabel(action)}
              </MenuItem>
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
    case "upload":
      return "上传图片";
    case "import":
      return "导入";
    case "theme":
      return "主题";
    case "settings":
      return "设置";
  }
}

function ToolbarMeasure({measureRef}: {measureRef: RefObject<HTMLDivElement>}) {
  return (
    <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute -left-[9999px] top-0 flex items-center gap-2">
      <div data-measure="upload">
        <Button variant="toolbar"><ImageUp size={14} />上传图片</Button>
      </div>
      <div data-measure="import">
        <Button variant="toolbar"><FileInput size={14} />导入</Button>
      </div>
      <div data-measure="preview">
        <PreviewModeToggle />
      </div>
      <div data-measure="theme">
        <Button variant="toolbar"><Palette size={14} />主题</Button>
      </div>
      <div data-measure="settings">
        <IconButton title="设置"><Settings size={16} /></IconButton>
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
