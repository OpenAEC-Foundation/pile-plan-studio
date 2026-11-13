import { useId, useState, type ReactNode } from "react";
import { Button } from "../../../openaec/react/src/index";
import SourceColumnPopover from "./SourceColumnPopover.tsx";
import "./editableTable.css";

type Props = {
  caption: string;
  meaning: string;
  label: string;
  disabled?: boolean;
  className?: string;
  grip?: ReactNode;
  children: ReactNode;
};

export default function EditableTableHeading({ caption, meaning, label, disabled, className, grip, children }: Props) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  if (disabled && anchor) setAnchor(null);
  const open = !!anchor && !disabled;

  function close(restoreFocus: boolean) {
    setAnchor(null);
    if (restoreFocus) anchor?.focus({ preventScroll: true });
  }

  return <th scope="col" className={className}>
    <div className="editable-table-heading">
      {grip}
      <Button type="button" className="source-preview-column-button" aria-label={label} disabled={disabled}
        aria-describedby={`${id}-meaning`} aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? `${id}-column` : undefined}
        onClick={event => open ? close(true) : setAnchor(event.currentTarget)}>
        <strong>{caption}</strong>
        <small id={`${id}-meaning`}>{meaning}</small>
        <span className="source-preview-column-caret" aria-hidden="true" />
      </Button>
    </div>
    {open && <SourceColumnPopover id={`${id}-column`} title={label} anchor={anchor} onClose={close}>
      {children}
    </SourceColumnPopover>}
  </th>;
}
