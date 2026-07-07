# Pile Plan Studio

Pile Plan Studio is a desktop application for exploring and assigning pile
configurations for structural load points. The app focuses on making the
engineering data visible and traceable: load points, CPTs, bearing capacities,
allowed pile options, utilization, governing CPTs, and estimated pile costs.

The project is developed in English as an OpenAEC-oriented Rust + Tauri
application with a lightweight TypeScript frontend.

## Repository Layout

- `crates/pile-plan-core`: Rust domain model and pile option calculation core.
- `apps/pile-plan-studio`: Vanilla TypeScript frontend and Tauri desktop shell.
- `sample_project`: Small sample project data used by the application.
- `docs`: Product and architecture notes.

## Development

Run the Rust core tests from the repository root:

```powershell
cargo test
```

Run the frontend tests:

```powershell
cd apps\pile-plan-studio
npm test
```

Build the frontend:

```powershell
cd apps\pile-plan-studio
npm install
npm run build
```

The frontend expects a modern Node.js runtime. Node 20 LTS or newer is
recommended. Install dependencies once with `npm install` before running tests
or builds.
