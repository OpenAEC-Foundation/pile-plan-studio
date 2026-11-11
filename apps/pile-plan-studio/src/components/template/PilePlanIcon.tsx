import assetUrl from "./icons/pile-plan-proposals.svg?url";

// In the SuperCloud workplace build the sprite is inline in index.html (see studioSprite.ts).
const spriteUrl = import.meta.env.MODE === "platform" ? "" : assetUrl;
import "./BlueprintIcon.css";

export type PilePlanIconId = "pile.options" | "pile.cpts" | "pile.cap-changes" |
  "pile.compression" | "pile.tension" | "edit.select-rectangle" | "pile.cpt-settings" |
  "pile.cost-settings" | "pile.group-settings" | "data.apply" | "pile.tip-regions" | "pile.load-groups";

/** Reviewed local candidates; kept separate from the pinned Blueprint assets. */
export default function PilePlanIcon({ id, size = 24 }: { id: PilePlanIconId; size?: 16 | 24 }) {
  return <svg className="blueprint-icon pile-plan-icon" width={size} height={size}
    viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" stroke="none">
    <use href={`${spriteUrl}#i${size}-${id}`} />
  </svg>;
}
