import assetUrl from "./icons/studio.svg?url";
import manifest from "./manifest.json";

const sprite = manifest.generated.find(file => file.path === "icons/studio.svg");
if (!sprite) throw new Error("Blueprint sprite is missing from its generated manifest.");

// A warm browser keeps an external SVG document when a <use> URL stays unchanged.
// Include its content hash so newly synced symbols also appear during live updates.
const spriteUrl = `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${sprite.sha256}`;
export default spriteUrl;
