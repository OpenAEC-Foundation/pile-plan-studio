import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  clampRightPanelSplit, DEFAULT_RIGHT_PANEL_SPLIT, MAX_RIGHT_PANEL_SPLIT,
  MIN_RIGHT_PANEL_SPLIT, rightPanelSplitAtPointer,
} from "../../../domain/workspace/rightPanelLayout.ts";

export default function SplitRightPanel({ top, bottom, ratio, onRatioChange }: {
  top: ReactNode; bottom: ReactNode; ratio: number; onRatioChange: (ratio: number) => void;
}) {
  const { t } = useTranslation("rightPanel");
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [draft, setDraft] = useState(clampRightPanelSplit(ratio));
  useEffect(() => { if (!dragging.current) setDraft(clampRightPanelSplit(ratio)); }, [ratio]);
  const pointerRatio = (event: PointerEvent) => {
    const bounds = container.current!.getBoundingClientRect();
    return rightPanelSplitAtPointer(event.clientY, bounds.top, bounds.height);
  };
  const commit = (value: number) => {
    const next = clampRightPanelSplit(value);
    setDraft(next);
    onRatioChange(next);
  };
  return <div className="right-panel-combined" ref={container}
    style={{ gridTemplateRows: `minmax(0, ${draft}fr) 7px minmax(0, ${1 - draft}fr)` }}>
    <section className="right-panel-combined-top" aria-label={t("tabs.loadPoint")}>{top}</section>
    <div className="right-panel-horizontal-splitter" role="separator" tabIndex={0}
      aria-label={t("split.resize")} aria-orientation="horizontal"
      aria-valuemin={MIN_RIGHT_PANEL_SPLIT * 100} aria-valuemax={MAX_RIGHT_PANEL_SPLIT * 100}
      aria-valuenow={Math.round(draft * 100)} title={t("split.help")}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => { if (dragging.current) setDraft(pointerRatio(event)); }}
      onPointerUp={event => {
        if (!dragging.current) return;
        dragging.current = false;
        commit(pointerRatio(event));
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { dragging.current = false; setDraft(clampRightPanelSplit(ratio)); }}
      onDoubleClick={() => commit(DEFAULT_RIGHT_PANEL_SPLIT)}
      onKeyDown={event => {
        const next = event.key === "ArrowUp" ? draft - 0.05 : event.key === "ArrowDown" ? draft + 0.05
          : event.key === "Home" ? MIN_RIGHT_PANEL_SPLIT : event.key === "End" ? MAX_RIGHT_PANEL_SPLIT : null;
        if (next === null) return;
        event.preventDefault();
        commit(next);
      }} />
    <section className="right-panel-combined-bottom" aria-label={t("tabs.cpts")}>{bottom}</section>
  </div>;
}
