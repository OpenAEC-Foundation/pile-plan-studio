# Shared Application Scale Design

## Goal

Browser and desktop must use the same compact visual baseline. The application
must distinguish this interface scale from the independent zoom level inside
the pile-plan viewer.

## Scale model

The application has three separate scale concepts:

1. **Compact design baseline**: the existing 80% interface presentation becomes
   the shared nominal 100% appearance in both browser and desktop.
2. **Application scale**: a user preference from 50% through 150%. Tauri applies
   this relative factor to the complete desktop WebView. At application scale
   100%, the WebView factor is `1.0`, without an additional desktop correction.
3. **Plan viewport zoom**: pan and zoom inside the pile-plan viewer. This remains
   project state and continues to be shown in the status bar.

The compact baseline is applied through the same root CSS class in browser and
desktop. Desktop no longer multiplies the application preference by the compact
baseline when calling Tauri `setZoom`.

## Startup

The browser applies the shared compact baseline synchronously before React
mounts. It continues to use native browser zoom for browser-level scaling.

Desktop loads the stored user settings and applies the Tauri WebView scale
before mounting the normal workspace. Until that is complete, the application
shows a neutral startup surface. This prevents the plan viewer from capturing
geometry at one WebView scale and then rendering at another.

Failure to apply Tauri zoom must not block startup. The application logs the
failure and opens at WebView factor `1.0`.

## Keyboard interaction

In desktop:

- `Ctrl+=` increases application scale by 10 percentage points;
- `Ctrl+-` decreases application scale by 10 percentage points;
- `Ctrl+0` restores application scale to 100%;
- scale remains clamped to 50%-150% and is stored as a user preference.

The browser keeps its native browser zoom shortcuts and native feedback.

## Scale indicator

After a desktop application-scale shortcut, a small non-interactive overlay is
shown in the top-right corner. It contains only the logical percentage, such as
`90%` or `110%`.

The overlay:

- appears immediately after the shortcut;
- restarts its display duration after every subsequent zoom step;
- remains visible for approximately 1.5 seconds;
- disappears with a short fade;
- uses the active theme surface, border, and text colors;
- is exposed as polite live status for assistive technology;
- does not appear for plan-viewer wheel zoom.

## Viewer behavior

Changing application scale must not change the stored plan viewport zoom. The
status bar continues to show only plan viewport zoom. The plan viewer may update
its measured canvas geometry after application scaling, but its world
projection and layout-compensation responsibilities remain independent from the
application scale.

## Documentation

`docs/architecture.md` retains a short explanation of the viewer's role and
links to `apps/pile-plan-studio/src/viewer/README.md`. Detailed coordinate,
resize, compensation, diagnostics, and regression guidance moves into that
code-adjacent README.

## Verification

Automated coverage must verify:

- both runtimes receive the same compact baseline class;
- desktop scale 100% maps to WebView factor `1.0`;
- desktop scale limits and shortcut increments remain unchanged;
- browser zoom shortcuts are not intercepted;
- the desktop percentage indicator is shown and renewed by zoom shortcuts;
- the status bar remains bound to plan viewport zoom;
- viewer geometry remains stable after the startup scale has been applied.

Manual desktop verification must compare browser and Tauri at nominal 100%,
then test `Ctrl+=`, `Ctrl+-`, and `Ctrl+0`, pointer selection, lasso, panel
resizing, CPT labels, and plan-viewer wheel zoom.
