# Pile Plan Studio

Pile Plan Studio is an open-source engineering tool for exploring and assigning
pile configurations to structural load points. It brings load points, CPTs,
foundation advice, pile options, utilization, and estimated costs together in
one interactive plan.

The calculation core is written in Rust. The same core runs natively in the
Tauri desktop application and through WebAssembly in the browser.

## Alpha Status

Pile Plan Studio is currently available as a public alpha. The application is
ready for exploration and early project testing, but its workflows and IFCPP
project format may still change.

**Engineering results produced by this alpha require verification by a qualified
professional.** Pile Plan Studio is decision support and does not replace the
engineer's responsibility for the foundation design.

## What You Can Do

- Open the included sample project and inspect the pile plan immediately.
- Import load points, CPT coordinates, and foundation advice from CSV or XLSX.
- Select CPTs automatically by quadrant or maximum-angle rules.
- Override the CPT selection for individual load points.
- Inspect valid, insufficient, and missing pile options per load point.
- Assign pile configurations manually or to multiple load points at once.
- Compare utilization, governing CPT, and estimated cost.
- Run the current greedy optimizer with configuration limits.
- Save and reopen the complete project as IFCPP.

### Selecting Load Points

- Click a load point to select it.
- Use **Shift+click** to add a load point to the selection or remove an already
  selected load point.
- Use **Shift+drag** on empty viewer space to draw a lasso and select all load
  points inside it.
- Use **Shift+click** on a pile size or tip level in the legend to select all
  load points whose current pile matches it. Size and tip selections can be
  combined.
- Press **Escape** or click empty viewer space to clear the selection.

### Inspecting Pile Options

- Click a row in the pile-options table to assign that configuration to the
  selected load point.
- When multiple load points are selected, the table shows their common options
  and assigns the chosen configuration to all of them.
- Click a column header to sort the table, or use its arrow to filter the
  available values.
- Click pile sizes or tip levels in the legend to enable or disable them. The
  pile-options table automatically follows the active legend filters.

## Try or Install

The [browser demo](https://pile-plan-studio.open-aec.com/) is the primary way to
explore the alpha and opens directly with the sample project.

Windows x64 installers will be published on the
[GitHub Releases page](https://github.com/OpenAEC-Foundation/pile-plan-studio/releases).
The browser and desktop application use the same Rust calculation core.

## Supported Project Data

Pile Plan Studio imports three source roles:

| Role | Required content | Formats |
| --- | --- | --- |
| Load points | ID, X, Y, FED | CSV, XLSX |
| CPTs | ID, X, Y | CSV, XLSX |
| Foundation advice | CPT ID, pile tip level, pile size, R<sub>c;net;d</sub> | CSV, XLSX |

The three files can be selected together and assigned to their roles before
import. Imported data, project settings, selected piles, and manual CPT choices
are stored in an `.ifcpp` project file.

## Known Limitations

The current CPT-selection rules are configurable approximations rather than an
objective engineering truth. The greedy optimizer supports decision-making but
does not guarantee a globally optimal pile plan. RFEM load-point import and
Excel export of selected piles are planned but are not part of this alpha.

See [Known limitations](docs/known-limitations.md) for the complete release
scope.

## Architecture

- `crates/pile-plan-core`: Rust domain model, import, pile-option calculations,
  costing, CPT selection, and greedy optimization.
- `crates/pile-plan-wasm`: thin WebAssembly interface for the browser.
- `apps/pile-plan-studio`: React interface and Tauri desktop shell.
- `sample_project`: sample IFCPP project and source data.
- `docs`: public product, architecture, format, and deployment documentation.

Engineering calculations live in Rust. React and TypeScript handle application
state, interaction, and rendering. See [Architecture](docs/architecture.md).

## Development

Requirements:

- Node.js 20 or newer;
- current stable Rust;
- `wasm-pack`;
- the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for
  desktop builds.

Install and run the browser development server:

```powershell
cd apps\pile-plan-studio
npm install
npm run dev
```

Run all automated tests:

```powershell
cargo test --workspace
cd apps\pile-plan-studio
npm test
```

Create the static browser build:

```powershell
cd apps\pile-plan-studio
npm run build
```

Create Windows desktop installers:

```powershell
cd apps\pile-plan-studio
npm run tauri build
```

See [Deployment](docs/deployment.md) for browser hosting details.

### AI-assisted Development

Development of Pile Plan Studio has been assisted by AI coding tools. Design
decisions, engineering requirements, review, and validation remain under human
responsibility.

## Contributing

Issues and pull requests are welcome. Please keep engineering logic in the Rust
core, add focused tests for behavioral changes, and keep the browser and desktop
interfaces on the same project model.

Report bugs and ideas through the
[GitHub issue tracker](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues).

## License

Pile Plan Studio is licensed under
[LGPL-3.0-or-later](LICENSE).
