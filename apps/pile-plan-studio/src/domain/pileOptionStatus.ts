import type { PileOptionTechnicalStatus } from "../core/projectTypes.ts";

export type PileOptionStatus = {
  className: "is-ok" | "is-missing" | "is-not-ok";
  label: "OK" | "Missing" | "Insufficient capacity";
};

export function getPileOptionStatus(option: {
  technicalStatus: PileOptionTechnicalStatus;
}): PileOptionStatus {
  if (option.technicalStatus === "valid") {
    return { className: "is-ok", label: "OK" };
  }

  if (option.technicalStatus === "missing_capacity_data") {
    return { className: "is-missing", label: "Missing" };
  }

  return { className: "is-not-ok", label: "Insufficient capacity" };
}
