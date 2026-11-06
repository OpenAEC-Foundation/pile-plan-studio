# React-componenten 0.4

React-componenten voor ontwerp 0.4 (issue [#12](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/12)). Ze maken precies de HTML en de `oa-`-klassen van het [webpakket](../README.md). De stijl staat dus op één plek, in `openaec-components.css`; de componenten voegen alleen het gedrag en de toegankelijkheid toe.

## Gebruik

Laad de stylesheets van het webpakket één keer in de app, en zet de B2-sprite van de app op een bereikbare plek:

```tsx
import "./openaec/openaec-fonts.css";
import "./openaec/openaec-tokens.css";
import "./openaec/openaec-components.css";
import { applyDisplay, Button, OpenAECProvider, TextField } from "@openaec/ui-react";

applyDisplay({ theme: "dark", text: "standard" });

<OpenAECProvider sprite="/icons/standard.svg">
  <TextField label="Projectnaam" defaultValue="Kantoor Velp" />
  <Button kind="primary" icon="file.save">Opslaan</Button>
</OpenAECProvider>
```

Het pakket is TypeScript-bron (`src/`), zonder eigen build. Een app met Vite of TypeScript bouwt het mee, zoals de Tauri-sjabloon. React 18 of nieuwer.

## Wat erin zit

| Groep | Componenten |
| --- | --- |
| Basis | `OpenAECProvider`, `Icon`, `applyDisplay` (thema, werkruimte, statusbalk, tekstgrootte) |
| Bediening | `Button`, `IconButton`, `TextField`, `TextArea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Progress` |
| Labels en tegels | `Status`, `Chip`, `Pill`, `Tile`, `ChoiceTiles`, `RecentList`, `InfoCard`, `FigureTile` |
| Meldingen | `Banner`, `Toast`, `Menu`, `Dialog`, `UpdateNotice` (bijwerken via de OpenAEC Installer, met de plugin `openaec-update`) |
| Schil | `Tabs`, `DocumentTabs`, `Panel`, `PropertyRow`, `Table`, `StatusBar`, `Sidebar`, `Steps`, `ActionBar`, `EmptyState`, `Heading`, `MonoLabel` |

## Toegankelijkheid

- **Echte elementen.** Knoppen zijn `<button>`, velden `<input>`, `<select>` en `<textarea>` met een `<label>`, de dialoog is het eigen `<dialog>`-element van de browser en de tabel een `<table>` met kolomkoppen.
- **Namen.** Een iconknop heeft een verplicht `label`; dat wordt de `aria-label` en de tooltip, ook bij toetsenbordfocus. Een sneltoets komt in `aria-keyshortcuts`.
- **Fouten.** Een veld met `error` krijgt `aria-invalid` en `aria-describedby` naar de melding eronder.
- **Toetsenbord.** Lint- en documenttabs, keuzetegels en menu's werken met de pijltjestoetsen, Home en End; alleen het gekozen item staat in de Tab-volgorde. In een selecteerbare tabel kiezen pijl omhoog en omlaag een rij.
- **Dialoog.** Opent modaal met `showModal()`: de focus blijft erin, Escape sluit via `onClose`, en de focus gaat terug naar waar hij was.
- **Meldingen.** Een fout wordt meteen voorgelezen (`role="alert"`), de rest beleefd (`role="status"`). Elke melding heeft een woord, zoals "Fout." of "Let op.", zodat kleur nooit het enige signaal is. Een toast verdwijnt na vijf seconden; een fout blijft staan.

## Controleren

```bash
node scripts/check_react_components.mjs
```

Dit doet een strikte typecontrole van `src/`, `test/` en `demo/`, en zet elk component naar HTML om om de klassen en aria-attributen na te lopen (95 controles op 31 componenten). Met `--demo` bouwt het ook [`demo/demo.tsx`](demo/demo.tsx) en toont het die op <http://127.0.0.1:4177/>. Het script leent TypeScript, React en esbuild van de Tauri-sjabloon, dus eerst `npm ci --ignore-scripts` in `style-book/project-templates/Tauri+React`.
