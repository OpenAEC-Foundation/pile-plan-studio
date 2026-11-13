import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../openaec/react/src/index";
import { elementLayoutScale } from "../../../domain/settings/uiBaseline.ts";

type Props = {
  id: string;
  title: string;
  anchor: HTMLButtonElement;
  onClose: (restoreFocus: boolean) => void;
  children: ReactNode;
};

export default function SourceColumnPopover({ id, title, anchor, onClose, children }: Props) {
  const { t } = useTranslation("common");
  const popup = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const panel = popup.current;
    const scrollport = anchor.closest(".source-preview-scroll");
    if (!panel || !scrollport) return;
    panel.showPopover?.();

    function position() {
      if (!panel || !scrollport) return;
      const bounds = anchor.getBoundingClientRect();
      const viewport = scrollport.getBoundingClientRect();
      if (bounds.width && (bounds.right <= viewport.left || bounds.left >= viewport.right ||
        bounds.bottom <= 0 || bounds.top >= window.innerHeight || bounds.bottom <= viewport.top)) {
        close.current(false);
        return;
      }
      const margin = 8;
      const gap = 4;
      const scale = elementLayoutScale(panel);
      panel.style.maxWidth = `${(window.innerWidth - margin * 2) / scale}px`;
      const above = bounds.top - gap - margin;
      const below = window.innerHeight - bounds.bottom - gap - margin;
      const placeAbove = panel.scrollHeight * scale <= above || above > below;
      panel.style.maxHeight = `${Math.max(0, placeAbove ? above : below) / scale}px`;
      const { width, height } = panel.getBoundingClientRect();
      const left = Math.max(margin, Math.min(Math.max(bounds.left, viewport.left), window.innerWidth - width - margin));
      const top = placeAbove ? bounds.top - gap - height : bounds.bottom + gap;
      panel.style.left = `${left / scale}px`;
      panel.style.top = `${top / scale}px`;
    }

    function dismiss(event: Event) {
      if (event.target instanceof Node && !anchor.contains(event.target) && !panel?.contains(event.target)) {
        close.current(false);
      }
    }

    position();
    panel.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(panel);
    observer?.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
      panel.hidePopover?.();
    };
  }, [anchor]);

  return (
    <div id={id} ref={popup} popover={typeof HTMLElement.prototype.showPopover === "function" ? "manual" : undefined}
      className="source-column-popover"
      role="dialog" aria-label={title}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        }
      }}
      onBlur={event => {
        if (event.relatedTarget && event.relatedTarget !== anchor && !event.currentTarget.contains(event.relatedTarget)) {
          onClose(false);
        }
      }}>
      <div className="source-column-popover-header">
        <strong>{title}</strong>
        <Button compact onClick={() => onClose(true)}>{t("close")}</Button>
      </div>
      {children}
    </div>
  );
}
