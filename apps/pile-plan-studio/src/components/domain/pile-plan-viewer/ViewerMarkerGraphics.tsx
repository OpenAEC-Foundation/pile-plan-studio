import { OPTIMIZER_QUESTION_PATH } from "../../../viewer/optimizerMarkerGeometry.ts";
import { getCptSymbolScale } from "../../../viewer/markerGraphicGeometry.ts";
import { renderPileSymbolSvgChildren } from "../../../viewer/pileSymbols.ts";
import type { ViewerMarkerGraphic, ViewerMarkerHalo } from "./viewerMarkerPresentation.ts";

type Props = { graphics: ViewerMarkerGraphic[] };

function haloColors(halo: ViewerMarkerHalo) {
  if (halo.kind === "missing") {
    return {
      center: `rgba(255, 193, 7, 0.22)`,
      middle: `rgba(255, 193, 7, 0.22)`,
      edge: `rgba(255, 193, 7, 0.22)`,
      outline: `rgba(194, 130, 0, 0.72)`,
      glow: `rgba(255, 193, 7, 0.32)`,
    };
  }
  const above = halo.kind === "above";
  const center = above ? "255, 230, 226" : "226, 248, 231";
  const middle = above ? "199, 53, 42" : "48, 153, 76";
  const edge = above ? "145, 31, 25" : "25, 112, 50";
  return {
    center: `rgba(${center}, ${0.2 + halo.intensity * 0.4})`,
    middle: `rgba(${middle}, ${0.12 + halo.intensity * 0.5})`,
    edge: `rgba(${edge}, ${0.08 + halo.intensity * 0.42})`,
    outline: `rgba(${middle}, ${0.18 + halo.intensity * 0.62})`,
    glow: `rgba(${middle}, ${0.08 + halo.intensity * 0.42})`,
  };
}

function StatusHalo({ graphic }: { graphic: ViewerMarkerGraphic }) {
  if (!graphic.halo) return null;
  const radius = 6 * graphic.scale;
  const colors = haloColors(graphic.halo);
  const gradientId = `viewer-status-halo-${graphic.id}`;
  return (
    <g transform={`translate(${graphic.x} ${graphic.y})`} opacity={graphic.halo.opacity}>
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="42%" stopColor={colors.center} />
          <stop offset="72%" stopColor={colors.middle} />
          <stop offset="100%" stopColor={colors.edge} />
        </radialGradient>
      </defs>
      <circle r={radius + graphic.scale} fill="none" stroke={colors.glow} strokeWidth={2 * graphic.scale} filter="url(#viewer-status-blur)" />
      <circle r={radius + graphic.scale} fill="none" stroke={colors.outline} strokeWidth={2 * graphic.scale} />
      <circle r={radius} fill={`url(#${gradientId})`} />
    </g>
  );
}

function PileGraphic({ graphic }: { graphic: ViewerMarkerGraphic }) {
  const { appearance, scale } = graphic;
  if (appearance.type === "pile") {
    const size = appearance.smallDot ? 6 : 12;
    const half = size * scale / 2;
    return (
      <g
        className="viewer-pile-symbol"
        transform={`translate(${-half} ${-half}) scale(${size * scale / 24})`}
        dangerouslySetInnerHTML={{
          __html: renderPileSymbolSvgChildren(
            appearance.symbol, appearance.color, `viewer-pile-${graphic.id}`,
          ),
        }}
      />
    );
  }
  if (appearance.type === "neutral") {
    return <circle r={3 * scale} fill="#8f999e" />;
  }
  if (appearance.type === "optimizer") {
    return (
      <g className="viewer-optimizer-symbol" transform={`scale(${16 * scale / 24})`}>
        <path className="marker-halo" d={OPTIMIZER_QUESTION_PATH} />
        <circle className="marker-halo" cx="0" cy="6" r="0.9" />
        <path className="marker-foreground" d={OPTIMIZER_QUESTION_PATH} />
        <circle className="marker-foreground" cx="0" cy="6" r="0.9" />
      </g>
    );
  }
  if (appearance.type === "error") {
    return (
      <g transform={`scale(${14 * scale / 24})`}>
        <path d="M-6-6L6 6M6-6L-6 6" fill="none" stroke={appearance.color} strokeLinecap="round" strokeWidth="4" />
      </g>
    );
  }
  return null;
}

function CptGraphic({ graphic }: { graphic: ViewerMarkerGraphic }) {
  const { appearance, scale } = graphic;
  if (appearance.type !== "cpt") return null;
  const selected = appearance.selectedStyle && !appearance.inspectedOnly;
  const cptScale = getCptSymbolScale(scale);
  return (
    <g
      className={`viewer-cpt-triangle${selected ? " is-selected" : ""}`}
      transform={`translate(${-12 * cptScale} ${-11 * cptScale}) scale(${cptScale})`}
    >
      <polygon points="3,3 21,3 12,19" />
      <text className="viewer-cpt-label" x="12" y="9.5" style={{ fontSize: `${21 * appearance.labelScale}px` }}>
        {appearance.label}
      </text>
    </g>
  );
}

export default function ViewerMarkerGraphics({ graphics }: Props) {
  return (
    <g className="viewer-marker-graphics" aria-hidden="true">
      <defs>
        <filter id="viewer-status-blur" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation={4 * (graphics[0]?.scale ?? 1)} />
        </filter>
      </defs>
      <g className="viewer-status-halos">
        {graphics.map((graphic) => graphic.halo ? <StatusHalo graphic={graphic} key={graphic.key} /> : null)}
      </g>
      {graphics.map((graphic) => (
        <g
          className={`viewer-marker-graphic is-${graphic.kind}`}
          key={graphic.key}
          opacity={graphic.opacity}
          transform={`translate(${graphic.x} ${graphic.y})`}
        >
          {graphic.ring ? (
            <circle
              cx={0}
              cy={0}
              r={graphic.ring.radius}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={1}
            />
          ) : null}
          {graphic.kind === "cpt" ? <CptGraphic graphic={graphic} /> : <PileGraphic graphic={graphic} />}
        </g>
      ))}
    </g>
  );
}
