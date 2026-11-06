import { NumberField, type NumberFieldProps } from "../../../template/NumberInput.tsx";

type Props = Omit<NumberFieldProps, "label"> & { label: string; suffix?: string };

/** Optimization supplies its draft/commit logic; the numeric control is shared. */
export default function IlpNumberField({ suffix, ...props }: Props) {
  return <div role="group" aria-label={props.label} className={`ilp-number-field${suffix ? " has-unit" : ""}`}>
    <NumberField {...props} />
    {suffix && <span className="ilp-number-unit oa-secondary">{suffix}</span>}
  </div>;
}
