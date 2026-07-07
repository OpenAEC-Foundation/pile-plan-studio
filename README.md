# Pile Plan Studio

This repository contains version 2 of the pile planning tool.

Version 2 is being developed in English as an OpenAEC-oriented Rust + Tauri
application:

- `crates/pile-plan-core`: Rust domain and pile option calculation core.
- `apps/pile-plan-studio`: Vanilla TypeScript + Tauri desktop shell.
- `docs/v2-direction.md`: product and architecture direction.

Run the Rust core tests:

```powershell
cargo test
```

Build the TypeScript frontend:

```powershell
cd apps\pile-plan-studio
npm install
npm run build
```

The v2 frontend expects a modern Node.js runtime. Node 20 LTS or newer is
recommended.
