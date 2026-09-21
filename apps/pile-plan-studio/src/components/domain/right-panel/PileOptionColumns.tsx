import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../../template/Modal.tsx";
import type { PileOptionTableColumn } from "../../../domain/pile-options/pileOptionTable.ts";
import {
  defaultPileOptionColumnLayout, movePileOptionColumn, setPileOptionColumnVisible,
  type PileOptionColumnLayout,
} from "../../../domain/pile-options/pileOptionColumnLayout.ts";
import "./PileOptionColumns.css";

export default function PileOptionColumns({ layout, selectedCount, onChange }: {
  layout: PileOptionColumnLayout;
  selectedCount: number;
  onChange: (layout: PileOptionColumnLayout) => void;
}) {
  const { t } = useTranslation("rightPanel");
  const [open, setOpen] = useState(false);
  const [dragged, setDragged] = useState<PileOptionTableColumn | null>(null);
  const [dropTarget, setDropTarget] = useState<PileOptionTableColumn | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const dragKey = useRef<PileOptionTableColumn | null>(null);
  const pointerTarget = (clientX: number, clientY: number): PileOptionTableColumn | null => {
    const rows = listRef.current?.children;
    if (!rows) return null;
    for (let index = 0; index < rows.length; index++) {
      const rect = rows[index].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return layout[index].key;
      }
    }
    return null;
  };
  const move = (key: PileOptionTableColumn, target: PileOptionTableColumn) => {
    const next = movePileOptionColumn(layout, key, target);
    onChange(next);
    setAnnouncement(t("columnSettings.moved", { column: t(`columns.${key}`), position: next.findIndex(column => column.key === key) + 1 }));
  };
  const clearDrag = () => { dragKey.current = null; setDragged(null); setDropTarget(null); };
  const visibleCount = layout.filter(column => column.visible).length;
  return <>
    <button className="pile-option-columns-button" type="button" onClick={() => setOpen(true)}
      aria-haspopup="dialog" title={t("columnSettings.title")}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M6 3v10M10 3v10" /></svg>
      {t("columnSettings.button")}
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title={t("columnSettings.title")}
      closeLabel={t("columnSettings.close")} width={380} className="pile-option-columns-dialog"
      footer={<>
        <button className="pile-option-columns-reset" type="button" onClick={() => onChange(defaultPileOptionColumnLayout(selectedCount))}>
          {t("columnSettings.reset")}
        </button>
        <button type="button" onClick={() => setOpen(false)}>{t("columnSettings.close")}</button>
      </>}>
      <div className="pile-option-columns-content">
        <p>{t(selectedCount > 1 ? "columnSettings.multiple" : "columnSettings.single")}</p>
        <p>{t("columnSettings.dragHelp")}</p>
        <ul className="pile-option-columns-list" ref={listRef}>
          {layout.map((column, index) => {
            const label = t(`columns.${column.key}`);
            const dropAfter = dragged !== null && layout.findIndex(item => item.key === dragged) < index;
            return <li key={column.key}
              className={`${dragged === column.key ? "is-dragging" : ""}${dropTarget === column.key && dragged !== column.key ? (dropAfter ? " drop-after" : " drop-before") : ""}`}>
              <button className="pile-option-column-grip" type="button"
                aria-label={t("columnSettings.drag", { column: label })} title={t("columnSettings.drag", { column: label })}
                onPointerDown={event => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragKey.current = column.key;
                  setDragged(column.key);
                }}
                onPointerMove={event => {
                  if (dragKey.current !== null) setDropTarget(pointerTarget(event.clientX, event.clientY));
                }}
                onPointerUp={event => {
                  const target = pointerTarget(event.clientX, event.clientY);
                  if (dragKey.current !== null && target !== null) move(dragKey.current, target);
                  clearDrag();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={clearDrag}
                onLostPointerCapture={clearDrag}
                onKeyDown={event => {
                  if (event.key === "Escape" && dragKey.current !== null) {
                    event.preventDefault();
                    clearDrag();
                    return;
                  }
                  const target = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1
                    : event.key === "Home" ? 0 : event.key === "End" ? layout.length - 1 : null;
                  if (target === null) return;
                  event.preventDefault();
                  if (layout[target]) move(column.key, layout[target].key);
                }}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5 3h1m4 0h1M5 8h1m4 0h1M5 13h1m4 0h1" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
              <label>
                <input type="checkbox" checked={column.visible} disabled={column.visible && visibleCount === 1}
                  onChange={event => onChange(setPileOptionColumnVisible(layout, column.key, event.currentTarget.checked))} />
                <span>{label}</span>
              </label>
            </li>;
          })}
        </ul>
        <span className="sr-only" role="status">{announcement}</span>
        <p className="pile-option-columns-help">{t("columnSettings.help")}</p>
      </div>
    </Modal>
  </>;
}
