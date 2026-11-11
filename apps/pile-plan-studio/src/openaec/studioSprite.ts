import assetUrl from "./icons/studio.svg?url";
import manifest from "./manifest.json";

const sprite = manifest.generated.find(file => file.path === "icons/studio.svg");
if (!sprite) throw new Error("Blueprint sprite is missing from its generated manifest.");

// A warm browser keeps an external SVG document when a <use> URL stays unchanged.
// Include its content hash so newly synced symbols also appear during live updates.
// The SuperCloud workplace build (`vite build --mode platform`) runs in a frame with an opaque origin, which refuses a
// <use> into a separate SVG file; that build puts the sprites into index.html (vite.config.ts) and refers to the page.
const spriteUrl = import.meta.env.MODE === "platform" ? "" : `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${sprite.sha256}`;
export default spriteUrl;
