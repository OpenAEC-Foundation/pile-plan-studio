import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectState } from "../../../domain/project/projectState.ts";
import { openCpt } from "../../../domain/workspace/selectionState.ts";
import { Button } from "../../../openaec/react/src/index";
import PileOptionStatus from "./PileOptionStatus.tsx";

type Props = {
  cptIds: number[];
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  onStateChange: (state: ProjectState) => void;
};

export default function MissingCptPopover({ cptIds, label, open, onOpenChange, state, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".missing-cpt-trigger")?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <span className="missing-cpt-popover" ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <Button compact kind="quiet"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="status-pill is-missing missing-cpt-trigger"
        title={open ? undefined : t("pileOptions.missingCptsTitle")}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      ><PileOptionStatus className="is-missing">{label}</PileOptionStatus></Button>
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
              <Button compact kind="quiet"
                className="cpt-link"
                key={cptId}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenChange(false);
                  onStateChange({ ...state, ...openCpt(state, cptId) });
                }}
              >{cptId}</Button>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
