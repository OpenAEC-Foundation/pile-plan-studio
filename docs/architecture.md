# Architecture

Pile Plan Studio follows the OpenAEC application model:

- Rust contains the domain core: CPT selection, bearing-capacity checks, pile
  option calculation, cost calculation, and project data operations.
- Tauri exposes the Rust core to the desktop application through native
  commands.
- TypeScript is kept as the viewer layer: UI state, map interaction, rendering,
  formatting, symbols, and browser-specific presentation behavior.
- The frontend calls the Rust core through `@tauri-apps/api/core` commands when
  it runs inside Tauri.
- The browser build uses `crates/pile-plan-wasm`, a thin WebAssembly wrapper
  around the same Rust core. This keeps the Vite preview aligned with the
  desktop calculation model.

The guiding rule is that engineering decisions must be implemented and tested in
`crates/pile-plan-core` first. Frontend code may present results, but should not
be the source of truth for calculations.

## Runtime Matrix

| Runtime | Core route | Best use |
| --- | --- | --- |
| Browser / Vite | Rust core compiled to WASM | Fast UI checks and web behavior |
| Desktop / Tauri | Native Rust commands | Final desktop behavior, file access, native integration |

Use the browser preview for most visual and interaction work. Use the desktop app
when testing anything that depends on Tauri, local file access, window behavior,
or native integrations.
