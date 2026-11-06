# Packaged desktop acceptance

This external controller exercises uninstrumented, signed proof packages for
the four desktop scenarios in issue #47. It does not expose an automation port
or add a test plugin to the product. MCP acceptance belongs to issue #48.

The Linux/macOS runtime jobs in `.github/workflows/release.yml` run these
scenarios for signed packages. They download immutable artifacts from the same
source commit and workflow run. An explicitly reused macOS proof retains its
source/architecture test gates and must have identical application source.
Linux detached signatures must match the known OpenAEC primary fingerprint;
macOS checks Developer ID signing, Gatekeeper and notarization tickets.
The runtime jobs have read-only permissions. Only a separate final job can
assemble a draft, after every release build and runtime job succeeds; it never
publishes. Manual proof dispatches create no release.

The scenarios drive native accessibility and keyboard/pointer input:

1. Inspect all 328 sample drawing targets, select with the pointer and change
   then reset desktop interface scale. Save screenshots for visual inspection.
2. Cancel a real native Open dialog, open an IFCPP file, cancel Save As, save,
   overwrite an existing file and reopen. Paths include spaces, accents and
   Greek characters. Compare source data after round trip; check all 328 CSV
   rows and the generated Excel workbook and worksheet rows.
3. Open two distinct projects through the installed OS file association, first
   with the app stopped and then in the same running instance. macOS uses
   LaunchServices (`open`); Linux uses GIO, as graphical file managers do. The
   portable AppImage instead verifies cold/warm file argument delivery: running
   a portable file does not register a host-wide file association.
4. Start native ILP through the interface, observe progress, cancel and check
   that saved plans did not change. Run a cost optimization as a new plan,
   verify the persisted native result and restore the previous plans with one
   Undo action.

Linux uses AT-SPI and Xvfb/Openbox. Both deb and normal FUSE AppImage launches
are exercised with separate temporary user preferences. macOS uses a small
Swift Accessibility controller. Only on disposable GitHub-hosted images that
already support unattended accessibility setup does the setup script grant
that controller Accessibility access. It never disables SIP, grants the
product permissions, or changes a developer's computer.

Each runtime artifact contains `gui/results.json`, native process/version/source evidence,
UI trees, screenshots and saved project/export files. An unfinished scenario
remains `NOT RUN`; a failing assertion fails the job. Discovery output alone
does not count as acceptance. Screenshots still require visual review, and
coverage of these scenarios does not imply support for every Linux desktop,
distribution, macOS version, import format or external MCP client.

The controllers require a graphical test session and OS dependencies installed
by the workflow. From the repository root inside that session:

```sh
python3 tools/desktop-acceptance/scenarios.py /path/to/pile-plan-studio /tmp/evidence
# Portable Linux launch (do not substitute extracted AppImage contents):
python3 tools/desktop-acceptance/scenarios.py /path/to/product.AppImage /tmp/portable-evidence portable
```

The macOS setup script is intentionally limited to hosted CI. For a developer
machine, compile `mac_ax.swift`, grant normal Accessibility permission to the
controller, and set `AX_HELPER` to its path. `discover.py` can inspect a new
platform's UI before updating selectors; its report explicitly says the
acceptance scenarios have not been run.
