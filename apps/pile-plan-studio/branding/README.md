# Approved application artwork

The 512 x 512 PNG is the exact artwork approved in [issue 59](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/59) and used by the publisher in the Snap Store.

Source: https://dashboard.snapcraft.io/site_media/appmedia/2026/11/open-pile-plan-studio-logo-afgerond.png

SHA-256: `ba4f607965cd00c2bd16a062ea54d84846e38ad9c4dbfc44cfab4666f2116b00`.

This is a raster source, not a vector master. Its four outer corner pixels have alpha 0. Larger icon frames are resampled from this source; no new drawing or colour changes are introduced.

From `apps/pile-plan-studio`, run `npm run icons:generate` with the locked Tauri CLI. The command copies only desktop PNG/ICO/ICNS outputs and the browser mark/favicon; this app does not currently package mobile/PWA targets. `npm run check:icons` verifies the source and generated hashes; tests and builds include it. No normal packaging step should regenerate these assets from another input. `generated-icons.json` records the resulting files.

The browser titlebar/About mark uses the original PNG directly. Corporate OpenAEC branding, functional ribbon icons, application identifiers and file associations are independent and unchanged.
