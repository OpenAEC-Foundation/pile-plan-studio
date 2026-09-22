# OpenAEC Product Page Copy

## Nederlands

### Open Pile Plan Studio

Open Pile Plan Studio is een open-source rekentool voor het verkennen en toewijzen
van paalconfiguraties aan belastinglocaties. Belastinglocaties, sonderingen,
funderingsadvies, paalopties, benutting en geraamde kosten komen samen in één
interactief palenplan.

De publieke alpha is direct in de browser te proberen met een voorbeeldproject.
Een ondertekende Windows-installer is beschikbaar via GitHub Releases. De
rekenkern is geschreven in Rust en draait in de browser via WebAssembly en op
de desktop via Tauri; de interface is gebouwd met React.

De alpha ondersteunt CSV/XLSX- en RFEM-import, IFCPP-projectbestanden, import en
export van palenplannen, handmatige en regelgestuurde sonderingselectie,
gezamenlijke bewerking van sonderingselecties, het verversen van afzonderlijke
projectbronnen, meerdere palenplanvarianten per project, gezamenlijke opties
voor meerdere locaties, kostenvergelijking, een bewerkbare legenda, aanpasbare
viewerweergave en optimalisatie met HiGHS in browser en desktop. De optimizer
minimaliseert kosten binnen configuratielimieten en kan vervolgens buurverschillen
verminderen binnen een kostenbudget. Live voorbeelden tonen de beste gevonden
oplossing; Snel verbeteren biedt een lokaal alternatief. Het rechterpaneel kan
belastinglocaties en sonderingen samen tonen, met instelbare tabelkolommen.

**Status: Alpha. Technische resultaten moeten altijd door een deskundige worden
gecontroleerd.**

- Broncode: https://github.com/OpenAEC-Foundation/pile-plan-studio
- Releases: https://github.com/OpenAEC-Foundation/pile-plan-studio/releases

## English

### Open Pile Plan Studio

Open Pile Plan Studio is an open-source engineering tool for exploring and assigning
pile configurations to structural load points. It combines load points, CPTs,
foundation advice, pile options, utilization, and estimated costs in one
interactive pile plan.

The public alpha can be explored directly in the browser with a sample project.
A signed Windows installer is available from GitHub Releases. Its calculation
core is written in Rust and runs through WebAssembly in the browser and Tauri
on desktop; the interface is built with React.

The alpha supports CSV/XLSX and RFEM import, IFCPP projects, pile-plan import
and export, manual and rule-based CPT selection, common options for multiple
load points, editing CPT selections for multiple load points, refreshing
individual project sources, cost comparison, adjustable viewer display, and an
editable legend, multiple pile-plan variants per project, and HiGHS optimization
in browser and desktop. The optimizer minimizes costs within configuration
limits, then optionally reduces neighbor differences within a cost budget.
Live previews show the best solution found; Quick improve provides a local
alternative. The right panel can show load points and CPTs together, with
customizable table columns.

**Status: Alpha. Engineering results must always be verified by a qualified
professional.**

- Source: https://github.com/OpenAEC-Foundation/pile-plan-studio
- Releases: https://github.com/OpenAEC-Foundation/pile-plan-studio/releases

