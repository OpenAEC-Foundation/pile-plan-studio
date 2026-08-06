# Undo and Redo Viewer Message

## Goal

Make the result of an Undo or Redo action noticeable without interrupting work in the pile plan viewer.

## Design

- Replace the Undo/Redo message in the bottom-left status bar with a transient message centered near the bottom of the viewer.
- Position the message above the status bar and relative to the viewer, not the complete application window.
- Use a compact dark surface with readable light text in both light and dark application themes.
- Keep the existing localized, action-specific text, such as `Undone: 15 pile changes`.
- Show the message for approximately three seconds, then dismiss it with a short fade.
- Allow at most two lines of text and constrain its width so it does not obscure a large part of the drawing.
- The message must not accept pointer input or block selection, panning, zooming, or lasso interaction.
- A new Undo or Redo replaces the currently visible message and restarts its display duration.

## Scope

This presentation is used only for Undo and Redo results. Import errors, warnings, confirmations, and other actionable messages keep their existing persistent or modal presentation.

## Verification

- Undo and Redo from both the title-bar controls and keyboard shortcuts show the viewer message.
- The correct localized action description is shown.
- Rapid consecutive history actions replace the message cleanly.
- The message disappears automatically and does not remain in the status bar.
- Viewer interaction remains available while the message is visible.
- The placement remains centered over the viewer when either side panel is resized.
