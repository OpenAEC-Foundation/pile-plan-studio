# Empty FRD Import Design

## Goal

Allow bearing-capacity imports to succeed when one or more FRD cells are empty, while clearly warning the user and treating the affected pile configurations as `Missing`.

## Behavior

- Only an actually empty FRD cell is recoverable.
- Rows with an empty FRD are omitted from the imported bearing-capacity collection.
- Missing CPT ID, tip, or pile size values remain hard import errors.
- Non-empty invalid FRD values such as `abc`, `-`, `N/A`, non-finite numbers, and spreadsheet errors remain hard import errors.
- If another row supplies a valid FRD for the same CPT, pile size, and tip, that valid capacity remains available.
- Omitting the row naturally produces `Missing` when no valid capacity exists for a selected CPT and pile configuration.

## Warning

The bearing-capacity import log receives one aggregated warning per source table:

`Ignored 3 bearing-capacity rows with an empty FRD in capacities.xlsx > Sheet1 (rows 84, 91, 105). These configurations are treated as Missing.`

At most the first ten physical source rows are listed. If more rows are omitted, the warning adds the number of additional rows. CSV warnings omit the worksheet name.

## Architecture

The bearing-capacity parser returns both parsed capacities and diagnostics about skipped empty-FRD rows. The project import functions add those diagnostics to the existing reconciliation warnings. No nullable FRD is added to the IFCPP object model, and no TypeScript calculation or validation is introduced.

Compatibility helpers that expose only a capacity list discard diagnostics, while complete project imports persist and display them through the existing import summary.

## Testing

Rust tests prove that:

- a CSV row with an empty FRD is skipped;
- an XLSX-style source table preserves worksheet and physical row context in the warning;
- multiple empty FRD rows produce one bounded warning;
- a non-empty invalid FRD remains an error;
- a valid duplicate configuration remains usable when an empty row is skipped;
- the end-to-end generic import persists the warning and produces `Missing` through the existing option logic.

Existing Rust, WASM, TypeScript, React, and production-build checks must continue to pass.
