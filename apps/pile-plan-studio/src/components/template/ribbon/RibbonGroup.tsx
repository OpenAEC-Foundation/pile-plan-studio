import { ReactNode } from "react";
import { MonoLabel } from "../../../openaec/react/src/index";

interface RibbonGroupProps {
  label: string;
  children: ReactNode;
}

export default function RibbonGroup({ label, children }: RibbonGroupProps) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-content">{children}</div>
      <div className="ribbon-group-label"><MonoLabel>{label}</MonoLabel></div>
    </div>
  );
}
