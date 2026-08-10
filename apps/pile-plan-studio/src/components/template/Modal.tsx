import { useEffect, useRef, useCallback, useId, type ReactNode } from "react";
import { elementLayoutScale, screenToLocal } from "../../domain/uiBaseline.ts";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  height?: number | string;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  width = 480,
  height,
  className,
  children,
  footer,
  closeLabel = "Close",
}: ModalProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".modal-close-btn")) return;
    isDragging.current = true;
    const dialog = dialogRef.current!;
    const rect = dialog.getBoundingClientRect();
    const layoutScale = elementLayoutScale(dialog);
    dragOffset.current = {
      x: screenToLocal(e.clientX - rect.left, layoutScale),
      y: screenToLocal(e.clientY - rect.top, layoutScale),
    };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dialogRef.current || !overlayRef.current) return;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const dialogRect = dialogRef.current.getBoundingClientRect();
      const layoutScale = elementLayoutScale(overlayRef.current);
      let newX = screenToLocal(e.clientX - overlayRect.left, layoutScale) - dragOffset.current.x;
      let newY = screenToLocal(e.clientY - overlayRect.top, layoutScale) - dragOffset.current.y;
      const overlayWidth = screenToLocal(overlayRect.width, layoutScale);
      const overlayHeight = screenToLocal(overlayRect.height, layoutScale);
      const dialogWidth = screenToLocal(dialogRect.width, layoutScale);
      const dialogHeight = screenToLocal(dialogRect.height, layoutScale);
      newX = Math.max(0, Math.min(newX, overlayWidth - dialogWidth));
      newY = Math.max(0, Math.min(newY, overlayHeight - dialogHeight));
      dialogRef.current.style.left = newX + "px";
      dialogRef.current.style.top = newY + "px";
      dialogRef.current.style.transform = "none";
      dialogRef.current.style.position = "absolute";
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostModal(overlayRef.current)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const focusableElements = getFocusableElements(dialogRef.current);
        if (focusableElements.length === 0) {
          e.preventDefault();
          dialogRef.current?.focus();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      firstFocusable(dialogRef.current)?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      previouslyFocusedElement.current?.focus();
    };
  }, [open]);

  // Reset position when reopened
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.style.left = "50%";
      dialogRef.current.style.top = "50%";
      dialogRef.current.style.transform = "translate(-50%, -50%)";
      dialogRef.current.style.position = "absolute";
    }
  }, [open]);

  if (!open) return null;

  const style: React.CSSProperties = { width };
  if (height) style.height = height;

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-dialog${className ? ` ${className}` : ""}`}
        ref={dialogRef}
        role="dialog"
        style={style}
        tabIndex={-1}
      >
        <div className="modal-header" onMouseDown={handleHeaderMouseDown}>
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label={closeLabel}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  return [...container.querySelectorAll<HTMLElement>([
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","))].filter((element) => !element.hasAttribute("hidden"));
}

function firstFocusable(container: HTMLElement | null): HTMLElement | null {
  return getFocusableElements(container)[0] ?? container;
}

function isTopmostModal(overlay: HTMLElement | null): boolean {
  const overlays = document.querySelectorAll(".modal-overlay");
  return overlay !== null && overlays[overlays.length - 1] === overlay;
}
