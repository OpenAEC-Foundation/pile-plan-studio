export type PileOptionStatus = {
  className: "is-ok" | "is-missing" | "is-not-ok";
  label: "OK" | "Missing" | "Not OK";
};

export function getPileOptionStatus(option: {
  isOption: boolean;
  missing_cpt_ids: number[];
}): PileOptionStatus {
  if (option.isOption) {
    return { className: "is-ok", label: "OK" };
  }

  if (option.missing_cpt_ids.length > 0) {
    return { className: "is-missing", label: "Missing" };
  }

  return { className: "is-not-ok", label: "Not OK" };
}
