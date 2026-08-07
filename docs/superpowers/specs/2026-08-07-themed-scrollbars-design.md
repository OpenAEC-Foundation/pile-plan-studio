# Themed Scrollbars Design

## Goal

Make every scrollbar in Pile Plan Studio follow the active application theme, including tables, settings panels, dialogs, and the legend editor.

## Design

- Define dedicated scrollbar tokens for the track, thumb, and interactive thumb state.
- Give every theme explicit scrollbar colors instead of deriving them from `text-muted`, because some themes combine dark application chrome with light content surfaces.
- Keep the thumb neutral at rest and increase its contrast on hover and while dragging. The accent color is not used, so scrollbars remain subordinate to the project content.
- Apply the styling globally in `themes.css`; individual panels do not receive scrollbar-specific rules.
- Support Chromium and Tauri through `::-webkit-scrollbar` selectors and Firefox through `scrollbar-color` and `scrollbar-width`.

## Visual Rules

- The track blends with the relevant application surface.
- The thumb is always distinguishable from the track.
- Hover and active states use a stronger neutral contrast, not a different hue.
- Scrollbars remain compact without making the drag target impractically narrow.

## Testing

- Add a stylesheet contract test that verifies the dedicated variables and both browser implementations exist.
- Run the complete frontend test suite and production build.
- Manually inspect a table, the cost settings panel, and the legend editor in light and dark themes.
