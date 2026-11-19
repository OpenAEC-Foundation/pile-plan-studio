import type { PresentedTipLevelRegionLayer } from "../../../../viewer/tipLevelRegionPresentation.ts";
import type { ProjectedTipLevelRegionOutline } from "../../../../viewer/tipLevelRegionGeometry.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";
import { memo, useId } from "react";

type Props = {
  layers: PresentedTipLevelRegionLayer[];
  outline?: ProjectedTipLevelRegionOutline;
};

const REGION_BOUNDARY_WIDTH = 1.25;

export default memo(function TipLevelRegionOverlay({ layers, outline }: Props) {
  const outlineId = useId();
  const model = buildTipLevelRegionSvgModel(layers);
  if (model.groups.length === 0) return null;

  return (
    <g className={model.className} mask={outline ? `url(#${outlineId})` : undefined}>
      {outline && <RegionOutlineMask id={outlineId} outline={outline} />}
      {model.groups.map((group) => (
        <g
          key={group.key}
          opacity={group.opacity}
        >
          {group.facePath && (
            <path
              className={group.fillRule ? "filled-region-cells" : undefined}
              d={group.facePath}
              fill={group.color}
              fillRule={group.fillRule}
              stroke="none"
            />
          )}
          {group.contourPath && (
            <path
              className="filled-region-contours"
              d={group.contourPath}
              fill="none"
              stroke={group.color}
              strokeWidth={REGION_BOUNDARY_WIDTH}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {group.edgePath && (
            <path
              d={group.edgePath.d}
              fill="none"
              stroke={group.color}
              strokeLinecap={group.edgePath.strokeLinecap}
              strokeWidth={group.edgePath.strokeWidth}
            />
          )}
          {group.nodePath && (
            <path d={group.nodePath} fill={group.color} stroke="none" />
          )}
        </g>
      ))}
    </g>
  );
});

const RegionOutlineMask = memo(function RegionOutlineMask({ id, outline }: { id: string; outline: ProjectedTipLevelRegionOutline }) {
  const { points, faces, edges, marginPx } = outline;
  const first = points[0];
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const facePath = faces.map(face =>
    `M ${face.map(({ x, y }) => `${x} ${y}`).join(" L ")} Z`
  ).join(" ");
  const edgePath = edges.map(([from, to]) => `M ${from.x} ${from.y} L ${to.x} ${to.y}`).join(" ");
  const circlePath = points.map(({ x, y }) =>
    `M ${x - marginPx} ${y} A ${marginPx} ${marginPx} 0 1 0 ${x + marginPx} ${y} `
    + `A ${marginPx} ${marginPx} 0 1 0 ${x - marginPx} ${y} Z`
  ).join(" ");
  const boundsMargin = marginPx + 1;
  return (
    <defs>
      <mask id={id} className="filled-region-outline" maskUnits="userSpaceOnUse"
        x={minX - boundsMargin} y={minY - boundsMargin}
        width={maxX - minX + 2 * boundsMargin} height={maxY - minY + 2 * boundsMargin}
      >
        {facePath && <path className="filled-region-outline-faces" d={facePath} fill="white" />}
        {edgePath && <path className="filled-region-outline-edges" d={edgePath} fill="none"
          stroke="white" strokeWidth={2 * marginPx} strokeLinecap="round" />}
        <path d={circlePath} fill="white" />
      </mask>
    </defs>
  );
});
