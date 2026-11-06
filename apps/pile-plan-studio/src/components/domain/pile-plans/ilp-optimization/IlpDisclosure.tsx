import { useId, type ReactNode } from "react";
import { Button, Heading } from "../../../../openaec/react/src/index";

export default function IlpDisclosure({ title, summary, open, onToggle, disabled = false, children }: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return <section className="ilp-disclosure">
    <Heading><Button kind="quiet" className="ilp-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span className="ilp-disclosure-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      <span className="ilp-disclosure-heading"><span>{title}</span>
        {!open && summary && <span className="ilp-disclosure-summary">{summary}</span>}
      </span>
    </Button></Heading>
    <div id={id} hidden={!open} className="ilp-disclosure-body">
      <fieldset className="ilp-settings-fields" disabled={disabled}>{children}</fieldset>
    </div>
  </section>;
}
