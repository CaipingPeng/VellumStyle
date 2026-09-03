import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject} from "react";
import {AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2, X} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import {toast} from "../Toast/toast.ts";
import type {MarkdownEditorHandle} from "./MarkdownEditor.tsx";
import {
  buildMarkdownTable,
  createTableData,
  findMarkdownTableAt,
  parseMarkdownTable,
  relocateMarkdownTable,
  type MarkdownTableData,
  type MarkdownTableRange,
  type TableCellAlignment,
} from "../../markdown/tableEditing.ts";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
  onClose: () => void;
}

const ALIGNMENTS: Array<TableCellAlignment | null> = [null, "left", "center", "right"];
const MAX_ROWS = 100;
const MAX_COLUMNS = 20;
const SIZE_PICKER_ROWS = 10;
const SIZE_PICKER_COLUMNS = 10;
const DEFAULT_COLUMN_WIDTH = 96;
const MIN_COLUMN_WIDTH = 64;
const MAX_COLUMN_WIDTH = 480;
const ROW_ACTIONS_WIDTH = 48;

interface TableSize {
  rows: number;
  columns: number;
}

function initialTable(editor: MarkdownEditorHandle | null): {data: MarkdownTableData; range: MarkdownTableRange | null} {
  const snapshot = editor?.getDocumentSnapshot();
  const range = snapshot ? findMarkdownTableAt(snapshot.text, snapshot.head) : null;
  const parsed = range ? parseMarkdownTable(range.text) : null;
  return {data: parsed ?? createTableData(), range: parsed ? range : null};
}

function alignIcon(alignment: TableCellAlignment | null) {
  if (alignment === "left") return <AlignLeft size={15} />;
  if (alignment === "center") return <AlignCenter size={15} />;
  if (alignment === "right") return <AlignRight size={15} />;
  return <AlignJustify size={15} />;
}

export default function TableEditorDialog({editorRef, onClose}: Props) {
  const initial = useRef(initialTable(editorRef.current));
  const originalRange = useRef(initial.current.range);
  const [header, setHeader] = useState(initial.current.data.header);
  const [aligns, setAligns] = useState(initial.current.data.aligns);
  const [rows, setRows] = useState(initial.current.data.rows.length ? initial.current.data.rows : [[]]);
  const [columnWidths, setColumnWidths] = useState(() => initial.current.data.header.map(() => DEFAULT_COLUMN_WIDTH));
  const [tableReady, setTableReady] = useState(initial.current.range !== null);
  const [hoveredSize, setHoveredSize] = useState<TableSize | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<number | null>(null);
  const [openColumnMenu, setOpenColumnMenu] = useState<number | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const editMode = originalRange.current !== null;

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const selectTableSize = ({rows: totalRows, columns}: TableSize) => {
    // Markdown 的首行是表头，因此 Word 式选择器中的总行数要减去表头行。
    const data = createTableData(Math.max(0, totalRows - 1), columns);
    setHeader(data.header);
    setAligns(data.aligns);
    setRows(data.rows);
    setColumnWidths(data.header.map(() => DEFAULT_COLUMN_WIDTH));
    setTableReady(true);
    requestAnimationFrame(() => firstInputRef.current?.focus());
  };

  const updateHeader = (column: number, value: string) => {
    setHeader((current) => current.map((cell, index) => index === column ? value : cell));
  };
  const updateCell = (row: number, column: number, value: string) => {
    setRows((current) => current.map((cells, rowIndex) =>
      rowIndex === row ? cells.map((cell, columnIndex) => columnIndex === column ? value : cell) : cells,
    ));
  };
  const insertColumn = (column: number, side: "left" | "right") => {
    if (header.length >= MAX_COLUMNS) return;
    const at = column + (side === "right" ? 1 : 0);
    setHeader((current) => [...current.slice(0, at), "", ...current.slice(at)]);
    setAligns((current) => [...current.slice(0, at), null, ...current.slice(at)]);
    setRows((current) => current.map((row) => [...row.slice(0, at), "", ...row.slice(at)]));
    setColumnWidths((current) => [...current.slice(0, at), DEFAULT_COLUMN_WIDTH, ...current.slice(at)]);
    setOpenColumnMenu(null);
  };
  const removeColumn = (column: number) => {
    if (header.length <= 1) return;
    setHeader((current) => current.filter((_, index) => index !== column));
    setAligns((current) => current.filter((_, index) => index !== column));
    setRows((current) => current.map((row) => row.filter((_, index) => index !== column)));
    setColumnWidths((current) => current.filter((_, index) => index !== column));
  };
  const insertRow = (row: number, side: "above" | "below") => {
    if (rows.length >= MAX_ROWS) return;
    const at = row + (side === "below" ? 1 : 0);
    setRows((current) => [
      ...current.slice(0, at),
      Array.from({length: header.length}, () => ""),
      ...current.slice(at),
    ]);
    setOpenRowMenu(null);
  };
  const removeRow = (row: number) => {
    if (rows.length <= 1) return;
    setRows((current) => current.filter((_, index) => index !== row));
  };
  const cycleAlignment = (column: number) => {
    setAligns((current) => current.map((alignment, index) => index === column
      ? ALIGNMENTS[(ALIGNMENTS.indexOf(alignment) + 1) % ALIGNMENTS.length]
      : alignment));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLDivElement>, column: number) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startWidth = columnWidths[column] ?? DEFAULT_COLUMN_WIDTH;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const width = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => current.map((value, index) => index === column ? width : value));
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
    };
    const onPointerUp = () => cleanup();
    resizeCleanupRef.current = cleanup;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const save = () => {
    const editor = editorRef.current;
    const snapshot = editor?.getDocumentSnapshot();
    if (!editor || !snapshot) return;
    const markdown = buildMarkdownTable({header, aligns, rows});
    if (originalRange.current) {
      const range = relocateMarkdownTable(snapshot.text, originalRange.current);
      if (!range || !editor.replaceRange(range.from, range.to, markdown, range.text)) {
        toast.show("原表格已发生变化，请关闭窗口后重新编辑。", "error");
        return;
      }
    } else {
      editor.insertBlockAtCursor(markdown);
    }
    onClose();
  };

  const deleteTable = () => {
    const editor = editorRef.current;
    const snapshot = editor?.getDocumentSnapshot();
    const stored = originalRange.current;
    const range = snapshot && stored ? relocateMarkdownTable(snapshot.text, stored) : null;
    if (!editor || !range || !editor.replaceRange(range.from, range.to, "", range.text)) {
      toast.show("原表格已发生变化，请关闭窗口后重新编辑。", "error");
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open
      title={editMode ? "编辑表格" : "插入表格"}
      onClose={onClose}
      width={820}
      contentPadding={false}
      initialFocusRef={firstInputRef}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>{editMode && <Button variant="ghost" className="text-danger" onClick={deleteTable}><Trash2 size={14} />删除表格</Button>}</div>
          <div className="flex gap-2"><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!tableReady} onClick={save}>{editMode ? "更新表格" : "插入表格"}</Button></div>
        </div>
      }
    >
      {!tableReady ? (
        <div className="flex flex-col items-center px-6 py-7">
          <div className="mb-4 h-6 text-sm font-medium text-text" aria-live="polite">
            {hoveredSize ? `${hoveredSize.rows} 行 × ${hoveredSize.columns} 列` : "移动鼠标选择表格尺寸"}
          </div>
          <div
            className="grid grid-cols-10 gap-1 rounded-sm border border-border bg-bg-secondary p-2"
            role="grid"
            aria-label="选择表格尺寸"
            onMouseLeave={() => setHoveredSize(null)}
          >
            {Array.from({length: SIZE_PICKER_ROWS}, (_, rowIndex) =>
              Array.from({length: SIZE_PICKER_COLUMNS}, (_, columnIndex) => {
                const size = {rows: rowIndex + 1, columns: columnIndex + 1};
                const highlighted = hoveredSize !== null
                  && size.rows <= hoveredSize.rows
                  && size.columns <= hoveredSize.columns;
                return (
                  <button
                    key={`${size.rows}-${size.columns}`}
                    type="button"
                    role="gridcell"
                    aria-label={`${size.rows} 行 × ${size.columns} 列`}
                    onMouseEnter={() => setHoveredSize(size)}
                    onFocus={() => setHoveredSize(size)}
                    onClick={() => selectTableSize(size)}
                    className={`h-6 w-6 rounded-[2px] border outline-none transition-colors ${highlighted ? "border-accent bg-accent" : "border-border bg-bg hover:border-accent"} focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]`}
                  />
                );
              }),
            )}
          </div>
          <span className="mt-3 text-xs text-text-muted">最多可快速选择 {SIZE_PICKER_ROWS} 行 × {SIZE_PICKER_COLUMNS} 列，进入编辑后仍可增删行列</span>
        </div>
      ) : (
        <div className="max-h-[68vh] overflow-auto p-3">
          <table
            className="table-fixed border-separate border-spacing-1"
            style={{width: ROW_ACTIONS_WIDTH + columnWidths.reduce((total, width) => total + width, 0) + (header.length + 2) * 4}}
          >
            <colgroup>
              <col style={{width: ROW_ACTIONS_WIDTH}} />
              {columnWidths.map((width, column) => <col key={column} style={{width}} />)}
            </colgroup>
            <thead>
              <tr>
                <th />
                {header.map((cell, column) => (
                  <th key={column} className="group relative pt-8 font-normal">
                    <div className={`absolute inset-x-0 top-0 flex h-7 items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${openColumnMenu === column ? "opacity-100" : ""}`}>
                      <button type="button" title="切换对齐方式" onClick={() => cycleAlignment(column)} className="rounded-sm border-0 bg-transparent p-1 text-text-muted hover:bg-bg-tertiary hover:text-text">{alignIcon(aligns[column] ?? null)}</button>
                      <Menu
                        open={openColumnMenu === column}
                        onClose={() => setOpenColumnMenu(null)}
                        minWidth={118}
                        trigger={<button type="button" title="添加列" disabled={header.length >= MAX_COLUMNS} onClick={() => setOpenColumnMenu((current) => current === column ? null : column)} className="rounded-sm border-0 bg-transparent p-1 text-text-muted hover:bg-bg-tertiary hover:text-text disabled:opacity-40"><Plus size={14} /></button>}
                      >
                        <MenuItem onClick={() => insertColumn(column, "left")}><ArrowLeft size={14} />在左侧插入列</MenuItem>
                        <MenuItem onClick={() => insertColumn(column, "right")}><ArrowRight size={14} />在右侧插入列</MenuItem>
                      </Menu>
                      {header.length > 1 && <button type="button" title="删除此列" onClick={() => removeColumn(column)} className="rounded-sm border-0 bg-transparent p-1 text-text-muted hover:bg-danger/10 hover:text-danger"><X size={14} /></button>}
                    </div>
                    <input
                      ref={column === 0 ? firstInputRef : undefined}
                      value={cell}
                      onChange={(event) => updateHeader(column, event.target.value)}
                      placeholder={`列 ${column + 1}`}
                      className="box-border h-8 min-w-0 w-full rounded-sm border border-border bg-bg-secondary px-2 text-sm font-semibold text-text outline-none focus:border-accent focus:ring-2 focus:ring-[color:var(--ring)]"
                    />
                    <div
                      role="separator"
                      aria-label={`调整第 ${column + 1} 列宽度`}
                      aria-orientation="vertical"
                      title="拖动调整列宽"
                      onPointerDown={(event) => startColumnResize(event, column)}
                      className="absolute -right-1 top-8 z-10 flex h-8 w-2 cursor-col-resize touch-none items-stretch justify-center"
                    >
                      <span className="w-px bg-transparent transition-colors group-hover:bg-border hover:!bg-accent" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group">
                  <td className="text-center">
                    <div className={`flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${openRowMenu === rowIndex ? "opacity-100" : ""}`}>
                      <Menu
                        open={openRowMenu === rowIndex}
                        onClose={() => setOpenRowMenu(null)}
                        minWidth={118}
                        trigger={<button type="button" title="添加行" disabled={rows.length >= MAX_ROWS} onClick={() => setOpenRowMenu((current) => current === rowIndex ? null : rowIndex)} className="rounded-sm border-0 bg-transparent p-1 text-text-muted hover:bg-bg-tertiary hover:text-text disabled:opacity-40"><Plus size={14} /></button>}
                      >
                        <MenuItem onClick={() => insertRow(rowIndex, "above")}><ArrowUp size={14} />在上方插入行</MenuItem>
                        <MenuItem onClick={() => insertRow(rowIndex, "below")}><ArrowDown size={14} />在下方插入行</MenuItem>
                      </Menu>
                      {rows.length > 1 && <button type="button" title="删除此行" onClick={() => removeRow(rowIndex)} className="rounded-sm border-0 bg-transparent p-1 text-text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                  {header.map((_, column) => (
                    <td key={column}>
                      <input
                        value={row[column] ?? ""}
                        onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                        className="box-border h-8 min-w-0 w-full rounded-sm border border-border bg-bg px-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-[color:var(--ring)]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
