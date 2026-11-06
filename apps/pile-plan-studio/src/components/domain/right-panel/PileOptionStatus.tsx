import type { ReactNode } from "react";
import { Status } from "../../../openaec/react/src/index";

// These are existing view statuses; technical assessment remains in the core.
export default function PileOptionStatus({ className, children }: { className: string; children: ReactNode }) {
  const tone = className === "is-ok" ? "success" : className === "is-missing" ? "warning" : className === "is-not-ok" ? "error" : undefined;
  return <Status tone={tone}>{children}</Status>;
}
