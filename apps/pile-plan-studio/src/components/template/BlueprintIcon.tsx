import spriteUrl from "../../openaec/studioSprite.ts";
import type { BlueprintIconId } from "../../openaec/icons/studioIcons.ts";
import "./BlueprintIcon.css";

export default function BlueprintIcon({ id, size = 16 }: { id: BlueprintIconId; size?: 16 | 24 }) {
  return (
    <svg className="blueprint-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true" focusable="false">
      <use href={`${spriteUrl}#i${size}-${id}`} />
    </svg>
  );
}
