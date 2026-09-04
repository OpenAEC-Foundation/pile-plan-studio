import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";

type Props = {
  layers: PresentedTipLevelRegionLayer[];
  width: number;
  height: number;
};

export default function TipLevelRegionOverlay({ layers, width, height }: Props) {
  const model = buildTipLevelRegionSvgModel(layers);
  if (model.groups.length === 0) return null;

  return (
    <svg
      aria-hidden={model.ariaHidden}
      className={model.className}
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
    >
      {model.groups.map((group) => (
        <g
          key={group.key}
          opacity={group.opacity}
        >
          {group.facePath && (
            <path d={group.facePath} fill={group.color} stroke="none" />
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
    </svg>
  );
}
