# Public Alpha Release Design

## Goal

Publish Pile Plan Studio as a public alpha on 14 July 2026. The browser demo is
the primary way for people to try the application. A signed Windows desktop
build is an additional download for users who need native file handling.

The release is a product demonstration and early testing build. It is not a
validated replacement for professional engineering review.

## Scope

The alpha includes the functionality already present in the React application:

- loading the embedded sample project;
- importing supported Excel and IFCPP project data;
- calculating pile options through the Rust/WASM core;
- inspecting load points, CPT selections, capacities, costs, and pile options;
- manually assigning pile configurations;
- running the greedy optimizer;
- downloading IFCPP in the browser;
- opening and saving IFCPP in the desktop application.

No new domain functionality is added before release. RFEM import and Excel
export remain planned follow-up work and must not be presented as available.

## Browser Demo

The browser build is a static Vite production build and requires no application
server or database. It opens with the sample project and must remain useful
without local file-system access. Users may import supported local files through
browser file pickers and download the resulting IFCPP project.

The deployment itself is handled separately by an OpenAEC colleague on an
OpenAEC subdomain. This repository must provide a reproducible production build
and clear deployment instructions.

The interface visibly identifies the release as an alpha and states that
engineering results require professional verification.

## Windows Desktop Release

The first desktop alpha targets Windows x64 only. A tag matching
`v0.1.0-alpha.1` triggers a GitHub Actions workflow that:

1. runs the required automated checks;
2. builds the Tauri application and Windows installers;
3. signs the executable, NSIS installer, and MSI through the existing OpenAEC
   Azure Trusted Signing setup;
4. uploads the installers to a draft GitHub Release.

An OpenAEC administrator must grant the Pile Plan Studio repository access to
the Trusted Signing organization secrets. The draft release is inspected before
it becomes public.

## Release Gates

### Source Gate

Before merging to `main`:

- all frontend tests pass;
- all Rust tests pass;
- TypeScript type checking passes;
- the browser production build passes;
- the Tauri Windows build passes;
- `git diff --check` reports no patch errors;
- the sample project and LIS project complete the manual smoke test.

The manual smoke test covers import, pile-option calculation, load-point and CPT
inspection, manual assignment, optimization, IFCPP save or download, reopening
the saved project, and preservation of pile and CPT choices.

Only release-blocking defects are fixed after the feature freeze. A defect is
blocking when it prevents startup, import, calculation, core interaction,
persistence, or a release build, or produces materially incorrect engineering
results without a clear failure message.

### Artifact Gate

After the builds are produced:

- test the deployed browser demo in current Chrome and Edge;
- verify the browser demo loads the sample project and downloads valid IFCPP;
- install the signed Windows build on a clean Windows environment;
- verify the installed application opens, saves, and reopens a project;
- confirm the Windows artifacts have valid OpenAEC signatures;
- publish the draft GitHub Release only after these checks pass.

## Documentation

The repository README is rewritten as the public entry point. It includes:

- a concise product description and alpha status;
- links to the browser demo and latest desktop release;
- the currently supported workflow and file formats;
- installation and build instructions;
- a clear engineering-results disclaimer;
- known alpha limitations;
- architecture and contribution guidance;
- LGPL-3.0-or-later licensing information.

A short reusable product-page section describes the purpose, principal features,
alpha status, technology, and links. It contains no claims about unfinished RFEM
import or Excel export.

## Release Sequence

1. Stabilize and test the current feature branch.
2. Merge the completed alpha work into `main`.
3. Add the visible alpha status and complete public documentation.
4. Produce and hand off the static browser build.
5. Add and validate the signed Windows release workflow.
6. Create the `v0.1.0-alpha.1` tag.
7. Verify the deployed browser demo and draft desktop release.
8. Publish the GitHub Release and announce the public alpha.

## Deferred Work

- RFEM load-point import;
- Excel export of selected piles;
- macOS and Linux desktop packaging;
- flexible import mapping beyond the currently supported formats;
- production-grade format stability guarantees;
- additional optimization algorithms;
- code-signing infrastructure changes beyond reusing OpenAEC Trusted Signing.
