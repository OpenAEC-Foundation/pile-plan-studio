# Windows Installer Icon Design

## Goal

Use the existing Pile Plan Studio application logo consistently for the
Windows NSIS installer and uninstaller in release 0.2.1.

## Design

Keep `src-tauri/icons/icon.ico` as the single Windows icon asset. The file
already contains 16, 24, 32, 48, 64, and 256 pixel variants and is already the
Tauri bundle icon used by the application executable and installed shortcuts.

Configure the Tauri Windows NSIS bundle explicitly so both `installerIcon` and
`uninstallerIcon` reference that same file. Do not duplicate the icon, add a
custom NSIS template, or change the current signing and release workflow.

## Verification

- Add a regression test that parses `tauri.conf.json` and verifies the bundle,
  installer, and uninstaller all reference `icons/icon.ico`.
- Run the focused frontend configuration test and the complete frontend test
  suite.
- Build the production frontend and an unsigned local NSIS installer.
- Inspect the generated installer, installed application shortcut, executable,
  uninstaller, and relevant installer dialogs on Windows at small and normal
  icon sizes.
- Leave the Azure Artifact Signing workflow unchanged; the next tagged release
  remains responsible for signing and validating the published installer.

## Out of Scope

- Redesigning or regenerating the approved Pile Plan Studio logo.
- Custom NSIS header or sidebar artwork.
- Changes to installer behavior, installation mode, or release signing.
