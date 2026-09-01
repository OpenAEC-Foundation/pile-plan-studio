import { createElement } from "react";

import { formatCoordinateReadout } from "../../domain/formatting.ts";

type CoordinatePoint = {
  x_mm: number;
  y_mm: number;
};

export function CoordinateReadout({ points, locale }: {
  points: ReadonlyArray<CoordinatePoint>;
  locale: string;
}) {
  const values = formatCoordinateReadout(points, locale);
  if (!values) return null;

  return createElement(
    "dl",
    { className: "coordinate-readout" },
    createElement("div", null, createElement("dt", null, "X"), createElement("dd", null, values.x)),
    createElement("div", null, createElement("dt", null, "Y"), createElement("dd", null, values.y)),
  );
}
