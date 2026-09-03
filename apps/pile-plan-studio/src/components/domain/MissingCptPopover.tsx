import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectState } from "../../domain/projectState.ts";
import { openCpt } from "../../domain/selectionState.ts";

type Props = {
  cptIds: number[];
  label: string;
  state: ProjectState;
  onStateChange: (state: ProjectState) => void;
};

export default function MissingCptPopover({ cptIds, label, state, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span className="missing-cpt-popover" ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="status-pill is-missing missing-cpt-trigger"
        ref={triggerRef}
        title={t("pileOptions.missingCptsTitle")}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >{label}</button>
      {open ? (
        <span
          aria-label={t("pileOptions.missingCptsList")}
          className="missing-cpt-dialog"
          id={popoverId}
          role="dialog"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <strong>{t("pileOptions.missingCptsList")}</strong>
          <span className="missing-cpt-list">
            {cptIds.map((cptId) => (
              <button
                className="cpt-link"
                key={cptId}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onStateChange({ ...state, ...openCpt(state, cptId) });
                }}
              >{cptId}</button>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
