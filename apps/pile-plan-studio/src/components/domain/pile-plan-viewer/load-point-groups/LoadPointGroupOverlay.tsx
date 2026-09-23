import type { LoadPointGroupGeometry } from "../../../../viewer/loadPointGroupGeometry.ts";
import { buildLoadPointGroupSvgModel } from "./loadPointGroupSvgModel.ts";

type Props = {
  geometry: LoadPointGroupGeometry[];
};

export default function LoadPointGroupOverlay({ geometry }: Props) {
  const model = buildLoadPointGroupSvgModel(geometry);
  if (model.groups.length === 0) return null;

  return (
    <g className={model.className}>
      <defs>
        {model.groups.map((group) => (
          <g id={group.primitiveId} key={`primitive:${group.key}`}>
            {group.facePath ? <path d={group.facePath} /> : null}
            {group.edgePath ? (
              <path
                d={group.edgePath.d}
                fill="none"
                stroke="white"
                strokeLinecap={group.edgePath.strokeLinecap}
                strokeWidth={group.edgePath.strokeWidth}
              />
            ) : null}
            {group.nodePath ? <path d={group.nodePath} /> : null}
          </g>
        ))}
        {model.filters.map((filter) => (
          <filter
            colorInterpolationFilters="sRGB"
            height="200%"
            id={filter.id}
            key={filter.id}
            width="200%"
            x="-50%"
            y="-50%"
          >
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius={filter.ringWidthPx}
              result="expanded"
            />
            <feComposite in="expanded" in2="SourceAlpha" operator="out" result="ring" />
            <feFlood floodColor={filter.color} result="contour-color" />
            <feComposite in="contour-color" in2="ring" operator="in" />
          </filter>
        ))}
      </defs>
      {model.groups.map((group) => (
        <g className={`load-point-group-contour is-${group.state}`} key={group.key}>
          <use href={`#${group.primitiveId}`} fill="white" filter={`url(#${group.filterId})`} />
          {group.warningPoint ? (
            <g
              aria-hidden="true"
              className="load-point-group-warning"
              transform={`translate(${group.warningPoint.x} ${group.warningPoint.y})`}
            >
              <circle r="6" />
              <text textAnchor="middle" y="3.5">!</text>
            </g>
          ) : null}
        </g>
      ))}
    </g>
  );
}
