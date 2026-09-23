import type { LoadPointGroupGeometry } from "../../../../viewer/loadPointGroupGeometry.ts";

export type LoadPointGroupSvgModel = {
  className: "load-point-group-overlay";
  filters: LoadPointGroupSvgFilter[];
  groups: LoadPointGroupSvgGroup[];
};

export type LoadPointGroupSvgFilter = {
  id: string;
  color: string;
  ringWidthPx: 1;
};

export type LoadPointGroupSvgGroup = {
  key: string;
  state: LoadPointGroupGeometry["state"];
  primitiveId: string;
  filterId: string;
  facePath: string | null;
  edgePath: { d: string; strokeWidth: number; strokeLinecap: "butt" } | null;
  nodePath: string | null;
  warningPoint: { x: number; y: number } | null;
};

export function buildLoadPointGroupSvgModel(
  geometry: LoadPointGroupGeometry[],
): LoadPointGroupSvgModel {
  return {
    className: "load-point-group-overlay",
    filters: [
      { id: "load-point-group-outline-default", color: "#747b82", ringWidthPx: 1 },
      { id: "load-point-group-outline-selected", color: "#d97706", ringWidthPx: 1 },
      { id: "load-point-group-outline-conflict", color: "#c62828", ringWidthPx: 1 },
    ],
    groups: geometry.map((group) => {
      const id = group.key.replace(/[^a-zA-Z0-9_-]/g, "-");
      const topCircle = [...group.circles].sort((left, right) => (
        left.y - right.y || right.x - left.x
      ))[0];
      return {
        key: group.key,
        state: group.state,
        primitiveId: `load-point-group-shape-${id}`,
        filterId: `load-point-group-outline-${group.state}`,
        facePath: joinSubpaths(group.faces.map(({ points }) => (
          `M ${points.map(({ x, y }, index) => `${index === 0 ? "" : "L "}${x} ${y}`).join(" ")} Z`
        ))),
        edgePath: group.segments.length === 0 ? null : {
          d: joinSubpaths(group.segments.map(({ x1, y1, x2, y2 }) => (
            `M ${x1} ${y1} L ${x2} ${y2}`
          )))!,
          strokeWidth: group.diameterPx,
          strokeLinecap: "butt",
        },
        nodePath: joinSubpaths(group.circles.map(({ x, y, radius }) => (
          `M ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y} `
            + `A ${radius} ${radius} 0 1 0 ${x + radius} ${y} Z`
        ))),
        warningPoint: group.hasConflict && topCircle
          ? { x: topCircle.x + topCircle.radius + 4, y: topCircle.y - topCircle.radius - 4 }
          : null,
      };
    }),
  };
}

function joinSubpaths(subpaths: string[]): string | null {
  return subpaths.length > 0 ? subpaths.join(" ") : null;
}
