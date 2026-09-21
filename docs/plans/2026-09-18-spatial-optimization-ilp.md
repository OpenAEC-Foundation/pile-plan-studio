# ILP-optimalisatie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only when the user explicitly chooses parallel agent execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een afzonderlijke ILP-optimizer toevoegen die met good_lp en microlp eerst een kostenreferentie bepaalt en vervolgens configuratiewisselingen minimaliseert binnen een kostenbudget.

**Architecture:** De Rust-core bezit voorbereiding, model, referentiebeheer, diagnoses en resultaatcontrole. WASM in een Worker en Tauri in een achtergrondtaak leveren dezelfde core-uitkomsten aan de app. De app bewaart afzonderlijke optimizerinstellingen, bedient de uitvoering en past een gecontroleerde oplossing als één projectwijziging toe.

**Tech Stack:** Rust, good_lp met uitsluitend de microlp-backend, serde, wasm-bindgen, Web Workers, Tauri 2, React/TypeScript en de bestaande Node-testaanpak.

**Spec:** [Ruimtelijke optimalisatie binnen een kostenbudget](../designs/2026-09-18-spatial-optimization-ilp.md), vastgesteld op 18 september 2026, voor [issue #21](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21).

## Global Constraints

- Lees de specificatie en `AGENTS.md` voordat uitvoering begint. Dit plan verandert het afgesproken wiskundige model niet.
- Gebruik good_lp voor modelopbouw en microlp voor zowel native als WASM. Geen HiGHS of highs-js in deze implementatie.
- Schakel good_lp-defaultfeatures uit en selecteer microlp expliciet; geen impliciete CBC-afhankelijkheid.
- Kosten zijn `n_u * k_c`; houd de bestaande afronding van `calculate_pile_cost` aan.
- Hard: technische beschikbaarheid, groepsgelijkheid, locks, benuttingsvoorwaarden en optionele maxima `N_T`, `N_S`, `N_C`.
- Doel: `sum(alpha*dT + beta*dS + (gamma-alpha-beta)*hTS)`, standaardgewichten `1, 1, 2`; geen secundaire kostendoelfunctie.
- Contracteer de Gabriel-graaf van alle oorspronkelijke projectlocaties; iedere ongeordende unitverbinding telt eenmaal. Geen afstandsweging, randlengte of gebiedenaantal.
- Configuraties buiten de selectie meetellen en aansluiten op vaste buitenburen zijn onafhankelijke instellingen. Kostenbudget geldt uitsluitend voor de doelunits.
- Geen stilzwijgende uitsluiting van units of versoepeling van grenzen. Alleen expliciete selectie van oplosbare units mag het doel verkleinen.
- Houd greedy beschikbaar en onthoud zijn instellingen onafhankelijk van ILP.
- Projectinhoud gaat via undo/redo en dirty state; voortgang, threads, Workers, referentiecache en solverhandles zijn tijdelijk.
- Elke nieuwe gebruikersmelding krijgt Nederlandse en Engelse tekst. Inspecteer zichtbare wijzigingen in de browser en native integratie in Tauri.
- Bewaar ondersteunde IFCPP-versies. Bewerk gegenereerde WASM-bestanden uitsluitend via de bestaande scripts.
- Geen commits, push, branches verwijderen, releases of versie-updates zonder afzonderlijke gebruikersopdracht. Behoud bestaande wijzigingen.

## Leeswijzer, afhankelijkheden en eigenaarschap

Dit is een uitvoeringsplan, geen melding dat de feature al is gebouwd of getest. De paden onder **Nieuw** zijn voorgestelde nieuwe bestanden; overige paden bestaan. Paden zijn relatief aan de repository-root, tenzij een volledige opdracht anders aangeeft.

De eerste drie taken leggen de basis vast. Daarna kunnen Rust en app onafhankelijk worden ontwikkeld tegen hetzelfde contract. Integratie gebeurt pas nadat beide werkpakketten hun eigen tests doorstaan.

```text
0 Solverproef ──> 1 Contract ──> 2 Instellingen/opslag
                     │                 │
                     ├─> 3 Voorbereiding ─> 4 Model ─> 5 Uitvoering/diagnose
                     │                                  │
                     └─────────────────> 6 Appbediening ─> 7 Projecttoepassing
                                                        │
                       5 + 7 ─> 8 Adapters/integratie ─> 9 Eindvalidatie
```

| Werkpakket | Eigenaar bij parallelle uitvoering | Bestanden die uitsluitend deze eigenaar wijzigt |
| --- | --- | --- |
| Taken 0–2: basis | Integrator | Publieke ILP-types, serialization-contracten, IFCPP-normalisatie, projectstate en historie |
| Taken 3–5: Rust | Rust-ontwikkelaar | `optimization/ilp/` behalve bevroren publieke types, `tip_level_regions/optimization_unit_graph.rs` en bijbehorende tests |
| Taken 6–7: app | App-ontwikkelaar | ILP-featureviews en pure ILP-appmodellen, ribbon, resultaatpaneel en vertalingen |
| Taak 8: integratie | Integrator | WASM/Tauri-adapters, Worker/client, runtimecontroller, `AppSession.tsx`, gedeelde exports |
| Taak 9 | Integrator met review van beide pakketten | Integratietests, meetresultaten en documentatie |

Geen twee ontwikkelaars bewerken gelijktijdig `AppSession.tsx`, publieke contracts, projectmigraties of gedeelde module-exports. Contractwijzigingen worden eerst met de andere werkstroom afgestemd en in de contractfixtures verwerkt. Parallel werken is mogelijk, maar dit document start geen agents of afzonderlijke taken.

## Uitwerkingskeuzes binnen het ontwerp

Deze keuzes maken het plan uitvoerbaar; het zijn geen nieuwe optimalisatiedoelen:

- Projectgebonden solverinstellingen komen in `settings.ilp_optimization`. Ontbrekende instellingen worden eenmalig afgeleid van de bestaande greedy-instellingen; daarna geen synchronisatie.
- Volg voor bereik, limietscope en opslaan-als-nieuw het bestaande opslagpatroon: afzonderlijke sessiewaarden voor ILP, geen nieuwe globale gebruikersvoorkeuren. Ook aansluiten op buitenburen is een afzonderlijke ILP-sessiewaarde. De actuele locatie-selectie blijft gedeeld.
- Nieuwe ILP-instellingen starten met **5%** meerkosten (`budget_basis_points: 500`), zoals afgesproken met de gebruiker, en gewichten **1, 1, 2**. Buitenburen aansluiten start uit.
- Percentage wordt opgeslagen in basispunten: `300` betekent 3,00%. Gewichten krijgen drie decimalen: `1000` betekent 1,000. De bediening vermeldt/toetst deze precisie; geen verborgen afronding bij invoer. Gamma is de totale straf voor beide verschillen.
- Standaardrekentijd en eventuele interne solve-intervallen worden pas vastgesteld na de solverproef en metingen. Het contract ondersteunt een expliciete tijdlimiet, maar dit plan doet geen prestatiebelofte.
- Gebruik een kleine uitvoeringsadapter rond good_lp/microlp, geen eigen algemene lineaire modelrepresentatie. De exact geïnstalleerde library-API is leidend; online documentatie van verschillende versies bleek niet volledig consistent.

## Taak 0 — Bewijs de benodigde solvermogelijkheden op beide platforms

**Wijzigen:** `crates/pile-plan-core/Cargo.toml`, `Cargo.lock` en zo nodig de afzonderlijke `apps/pile-plan-studio/src-tauri/Cargo.lock` bij native verificatie.

**Nieuw:** `crates/pile-plan-core/examples/ilp_solver_probe.rs`, `docs/designs/2026-09-18-ilp-solver-validation.md`.

**Interface:** Deze taak levert de geteste versies, beschikbare backendfuncties en een werkende strategie voor tijdslimieten/onderbreking. Zij voegt nog geen productbediening toe. Publieke contracten worden pas in taak 1 vastgezet.

- [ ] Leg de actuele werkboom en bestaande teststatus vast, zonder bestaande bestanden te herstellen of te committen.
- [ ] Resolve een stabiele good_lp-versie met microlp, inspecteer de daadwerkelijk gedownloade adapterbron en pin het geteste resultaat in de lockfiles. Voeg de dependency toe met expliciete featureselectie:

  ```powershell
  cargo add good_lp --package pile-plan-core --no-default-features --features microlp
  ```

  Controleer daarna in `Cargo.toml` dat `default-features = false` en uitsluitend `features = ["microlp"]` zijn ingesteld; de werkelijk opgeloste versies komen in het proefdocument.

- [ ] Maak een klein binair model met expliciete backendselectie. Dit is de basistest van de proef:

  ```rust
  use good_lp::{constraint, microlp, variable, variables, Solution, SolverModel};
  let mut vars = variables!();
  let x = vars.add(variable().binary());
  let y = vars.add(variable().binary());
  let solved = vars.minimise(x + 2.0 * y).using(microlp)
      .with(constraint!(x + y >= 1)).solve().unwrap();
  assert_eq!(solved.value(x).round(), 1.0);
  assert_eq!(solved.value(y).round(), 0.0);
  ```

- [ ] Voeg afzonderlijke proefgevallen toe voor bewezen onhaalbaarheid (`x >= 1` en `x <= 0`), vroeg afbreken zonder incumbent, tijdlimiet met incumbent en bewezen optimum. Gebruik een groter deterministisch gegenereerd binair probleem voor onderbreking; de feitelijk waargenomen uitkomst wordt geregistreerd, niet geforceerd als onhaalbaar geïnterpreteerd.
- [ ] Controleer of de adapter incumbent, stopreden, werkelijke bound/gap, startoplossing en hervatten doorgeeft. Onderzoek alleen voor ontbrekende informatie een getypeerde brug naar de onderliggende microlp-problem/solution-API; behoud de modelopbouw in good_lp.
- [ ] Probeer dezelfde route in een browser-Worker met release-WASM. Controleer klok/tijdlimietondersteuning, importpad, binary integrality en gedrag bij `Worker.terminate()`. Een geslaagde native proef bewijst geen werkende WASM-tijdlimiet.
- [ ] Meet hoe native uitvoering daadwerkelijk eindigt na een stopverzoek. Een `JoinHandle` aborteren is geen bewijs dat een lopende blocking solver stopt. Gebruik hervatbare begrensde solverstappen met een tussenliggende cancelcheck wanneer de geteste API dit ondersteunt. Laat expliciet zien welke maximale stopvertraging haalbaar is.
- [ ] Registreer resultaten, exacte versies, commando's en beperkingen in het proefdocument. Houd alleen nuttige reproduceerbare voorbeelden; verwijder tijdelijke proefbediening.

**Gate:** Tijdlimiet zonder oplossing blijft onderscheiden van bewezen onhaalbaarheid; resultaten zijn native/WASM beschikbaar; stoppen heeft een aantoonbare uitvoeringsstrategie. Als de geteste versies dit niet leveren, werk eerst de adapterkeuze uit en bespreek het concrete resterende verschil. Geen stilzwijgende overstap naar HiGHS, onbeperkte native achtergrondrun of fictieve voortgang. Appwerk met contractfixtures kan wel doorgaan.

**Verificatie:** `cargo run -p pile-plan-core --release --example ilp_solver_probe`, `cargo test --workspace`; in de app `npm run build:wasm` en de Worker-proef in een browser.

## Taak 1 — Bevries types, berichten en contractfixtures

**Nieuw Rust:** `crates/pile-plan-core/src/optimization/ilp/{mod.rs,types.rs,contract_tests.rs}`.

**Nieuw frontend:** `apps/pile-plan-studio/src/core/ilpOptimizationTypes.ts`, `ilpOptimizationContract.ts`, `ilpOptimizationContract.test.ts`.

**Nieuw fixtures:** `tests/fixtures/ilp-contract/{request.json,optimal.json,blocked.json,time-limit-no-solution.json,cancelled.json}`.

**Wijzigen:** `crates/pile-plan-core/src/optimization/mod.rs`, `crates/pile-plan-core/src/lib.rs`.

**Interfaces:** Onderstaande namen en betekenis worden gedeeld door beide werkstromen. Bestaande domeintypes worden geïmporteerd, niet opnieuw gedefinieerd. Wirevelden gebruiken snake_case, statuswaarden eveneens. Frontend-invoer gebruikt camelCase en de bestaande serialization-helpers; publieke core-uitkomsten behouden hun wirevelden.

```rust
// types.rs; imports uit bestaande core-modules.
pub struct IlpOptimizationSettings {
    pub max_pile_tip_levels: Option<u32>,
    pub max_pile_sizes: Option<u32>,
    pub max_pile_configurations: Option<u32>,
    pub max_utilization: f64,
    pub candidate_source: OptimizationCandidateSource,
    pub budget_basis_points: u32,
    pub transition_weights: IlpTransitionWeights,
}
pub struct IlpTransitionWeights {
    pub tip_only_milli: u32,
    pub size_only_milli: u32,
    pub both_milli: u32,
}
pub struct IlpOptimizationInput {
    pub load_points: Vec<LoadPoint>,
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
    pub candidate_configurations: Vec<PileConfigurationKey>,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub settings: IlpOptimizationSettings,
    pub limit_scope: OptimizationLimitScope,
    pub include_boundary_transitions: bool,
}
pub struct IlpRunRequest {
    pub run_id: String,
    pub input: IlpOptimizationInput,
    pub time_limit_ms: Option<u32>,
}
```

Geef serialiseerbare types de gebruikelijke `Clone`, `Debug`, `Serialize`, `Deserialize` en waar toepasbaar `PartialEq`. Valideer `max_utilization` als eindig en in `(0,1]`. Een uitgeschakeld maximum is `None`, niet nul; een ingeschakeld maximum is positief. Geen frontend-clamping aan het aantal actieve kandidaten: buitenlabels en geforceerde locks kunnen daarbuiten vallen.

Definieer daarnaast in `types.rs` en spiegel in `ilpOptimizationTypes.ts`:

| Type | Exacte velden/varianten |
| --- | --- |
| `IlpPhase` | `Preparation`, `CostReference`, `Spatial`, `LimitDiagnosis` |
| `IlpTermination` | `Completed`, `TimeLimit`, `Cancelled`, `SolverError` |
| `IlpProof` | `Optimal`, `Feasible`, `Infeasible`, `Unknown` |
| `IlpAssignment` | `load_point_id: u32`, `configuration: PileConfigurationKey` |
| `IlpCounts` | `tip_levels: u32`, `pile_sizes: u32`, `configurations: u32` |
| `IlpTransitionCounts` | `tip_only: u32`, `size_only: u32`, `both: u32` |
| `IlpCostReference` | `cost: u64`, `proof: IlpProof`, `termination: IlpTermination` |
| `IlpSolution` | `assignments: Vec<IlpAssignment>`, `cost: u64`, `budget: u64`, `reference: IlpCostReference`, `counts: IlpCounts`, `transitions: IlpTransitionCounts`, `score_milli: u64`, `proof: IlpProof`, `termination: IlpTermination` |
| `IlpDiagnostic` | `code: String`, `load_point_ids: Vec<u32>`, `blocking: bool` |
| `IlpLimitProposal` | `required_limits: IlpCounts`, `increases: IlpCounts`, `minimality_proven: bool`, `witness: Vec<IlpAssignment>` |
| `IlpProgress` | `phase: IlpPhase`, `elapsed_ms: u64`, `incumbent_objective: Option<f64>`, `best_bound: Option<f64>`, `relative_gap: Option<f64>` |

Alle bedragen/scoretotalen moeten tevens exact representeerbaar zijn voor de gebruikte solvercoëfficiënten en het JS-wireformaat. Overschrijding geeft `numeric_range_exceeded`, nooit stille afronding. Een ontbrekende bound/gap blijft `None`; vul geen nul in en presenteer een ingestelde stoptolerantie niet als gemeten gap.

`IlpOptimizationOutcome` is een tagged enum (`status`):

- `Solved { solution: IlpSolution, diagnostics: Vec<IlpDiagnostic> }`;
- `Blocked { diagnostics: Vec<IlpDiagnostic>, solvable_load_point_ids: Vec<u32> }`;
- `Infeasible { diagnostics: Vec<IlpDiagnostic>, proposal: Option<IlpLimitProposal> }`;
- `NoSolution { phase: IlpPhase, termination: IlpTermination }`;
- `Cancelled`;
- `Failed { code: String }`.

`Solved` betekent een volledige gecontroleerde toewijzing van het doel. `proof` maakt onderscheid tussen feasible en optimal. Een gestopte run wordt niet automatisch toegepast. Een aanwezige geldige incumbent bij tijdlimiet mag wel `Solved` opleveren, met de juiste bewijskwaliteit. Een bewezen optimum van de ruimtelijke fase bewijst niet achteraf dat een tijdgelimiteerde kostenreferentie kostenoptimaal was.

`IlpEvent` is een tagged enum (`kind`) met `Progress { run_id, progress }` en `Finished { run_id, outcome }`. Alle berichten dragen de run-id. Voorbereidingsdiagnoses worden via de uitkomst geleverd. Aanvullende tussentijdse incumbentberichten zijn niet nodig voor deze versie.

Definieer frontend-invoer expliciet als `IlpOptimizationContractInput`: dezelfde velden als Rusts `IlpOptimizationInput`, met camelCase veldnamen en de bestaande frontend-domeintypes voor locaties, opties en groepen. `optionsByLoadPoint` en `currentAssignments` zijn Maps. Frontends `IlpRunRequest` heeft `runId: string`, `input: IlpOptimizationContractInput` en `timeLimitMs: number | null`. Alleen de contractconversie maakt daarvan snake_case browser-/desktoprequests; projectsettings en core-uitkomsten gebruiken de hierboven vastgelegde wirevelden.

`time_limit_ms` is de totale deadline van één run vanaf het begin van de voorbereiding, inclusief beide optimalisatiefasen en eventuele diagnose. Verdeel de beschikbare solvertijd expliciet tussen de kosten- en ruimtelijke fase volgens de in taak 9 gemeten uitvoeringsinstellingen; een al beschikbare referentie geeft de resterende tijd aan de ruimtelijke fase. Na het verstrijken van de deadline start geen nieuwe solve. Een bruikbare referentie kan dan als haalbaar ruimtelijk resultaat worden teruggegeven. `None` betekent geen automatische deadline, maar behoudt de geteste stopmogelijkheid. Voorkom dat hervatten de oorspronkelijke totale deadline reset.

- [ ] Schrijf eerst roundtriptests voor bovengenoemde fixtures. `blocked.json` bevat afzonderlijk een lege lokale unit en `solvable_load_point_ids`; `time-limit-no-solution.json` is nadrukkelijk geen `infeasible`.
- [ ] Maak requestconversies `toBrowserIlpOptimizationRequest` en `toDesktopIlpOptimizationRequest`. Hergebruik `toCorePileOptionsByLoadPoint`, `toWasmNumberKeyedMap` en `toStringKeyedRecord`. Clone mutable collecties voor de run-snapshot.
- [ ] Test met dezelfde fixture dat numerieke mapkeys, millimeterconfiguraties, `null`-maxima, beide scopes en onafhankelijke gewichten dezelfde betekenis hebben in browser en native.
- [ ] Implementeer types en exports; leg de vastgelegde proefbeperkingen uit taak 0 bij de statusconversie vast.
- [ ] Voeg een decodeertest toe die een onbekende of ongeldige uitkomst veilig als contractfout afhandelt; verzin geen succesvolle standaardstatus.

```typescript
// Kernasserties in ilpOptimizationContract.test.ts na fixture-inlezing.
assert.equal(noSolution.status, "no_solution");
if (noSolution.status === "no_solution") {
  assert.equal(noSolution.termination, "time_limit");
}
assert.equal(optimal.status, "solved");
if (optimal.status === "solved") {
  assert.ok(optimal.solution.cost <= optimal.solution.budget);
  assert.equal(optimal.solution.proof, "optimal");
}
```

**Verificatie:** `cargo test -p pile-plan-core ilp`; in de app `node --test src/core/ilpOptimizationContract.test.ts`.

## Taak 2 — Onafhankelijke instellingen en compatibele opslag

**Wijzigen Rust:** `crates/pile-plan-core/src/{project.rs,ifcpp.rs}`, ILP `types.rs` en bestaande fixtures/constructors die `ProjectSettings` direct maken.

**Wijzigen frontend:** `src/core/{projectFile.ts,projectDocumentContract.ts,projectTestSupport.ts}`, `src/domain/project/{projectState.ts,projectContent.ts,projectContent.test.ts,projectPersistence.test.ts,openedProject.test.ts}`, `src/domain/project/history/{historyAction.ts,historyAction.test.ts,historyMessage.ts,historyMessage.test.ts}` onder de app.

**Vertalingen:** `src/i18n/locales/{nl,en}/common.json` voor historie en eventuele documentvalidatie.

**Interface:** `ProjectSettings.ilp_optimization: Option<IlpOptimizationSettings>` accepteert oudere documenten via serde-default. Normalisatie vult ontbrekende waarden vanuit greedy. De geladen frontend heeft altijd `ilpOptimizationSettings: IlpOptimizationSettings`. Voeg afzonderlijke tijdelijke velden toe: `ilpOptimizationTargetScope`, `ilpOptimizationLimitScope`, `ilpOptimizationCreatesPilePlan`, `ilpIncludeBoundaryTransitions`. De runstatus krijgt in taak 8 een eigen controller; geen Worker of referentie in projectinhoud.

- [ ] Schrijf Rust-tests voor lezen van ondersteunde schema's 1, 2, 3 en 4 zonder ILP-veld; verwacht een genormaliseerde ILP-kopie van de bestaande greedywaarden plus 5% en 1/1/2. Controleer het schema-4 roundtrip met afwijkende greedy- en ILP-waarden.
- [ ] Voeg het optionele veld en normalisatie toe. Behoud schema 4 zolang de toevoeging compatibel is met de bestaande reader/writer; documenteer de toevoeging. Verander geen application version. Valideer ongeldige numerieke ILP-waarden met een gerichte documentfout.
- [ ] Neem `ilpOptimizationSettings` op in `ProjectContent`, de keys voor structurele vergelijking, de documentdraft en restore. Neem tijdelijke scopes, selectie, runstatus en referenties niet op.
- [ ] Geef ILP-instellingen een herkenbare historieomschrijving. Toon bij undo/redo geen oude solvervoortgang; relevante undo/redo invalideert de actieve run via taak 8.
- [ ] Initialiseer de tijdelijke ILP-keuzes eenmalig vanuit de bestaande greedy-sessiewaarden. Verander een van beide optimizers en controleer dat de andere zijn waarden behoudt.

```typescript
// projectContent.test.ts: gebruik de bestaande projectfixture en contenthelpers.
const changed = { ...initial, ilpOptimizationSettings: {
  ...initial.ilpOptimizationSettings, budget_basis_points: 1000,
} };
assert.equal(changed.optimizationSettings, initial.optimizationSettings);
assert.notEqual(changed.ilpOptimizationSettings, initial.ilpOptimizationSettings);
```

- [ ] Voeg roundtrip- en undo/redo-tests toe die de ILP-waarde 10% terugbrengen naar de standaardwaarde 5%, terwijl greedy-instellingen en huidige selectie hun eigen gedrag behouden. Een voortgangsupdate maakt het project niet dirty.

**Verificatie:** `cargo test -p pile-plan-core ifcpp`; app-tests voor projectcontent, projectpersistence, openedProject en history. Daarna kunnen taken 3 en 6 parallel beginnen.

## Taak 3 — Voorbereiding en gecontracteerde unitgraaf

**Nieuw:** `crates/pile-plan-core/src/optimization/ilp/{prepare.rs,prepare_tests.rs,test_support.rs}`, `crates/pile-plan-core/src/tip_level_regions/optimization_unit_graph.rs`.

**Wijzigen:** `optimization/units.rs`, `optimization/greedy.rs` uitsluitend voor klein gedeeld voorbereidingshergebruik indien nodig; `tip_level_regions/mod.rs`; module-exports gecoördineerd met de integrator.

**Interfaces:** `prepare_ilp_optimization(&IlpOptimizationInput) -> Result<PreparedIlpProblem, IlpOptimizationOutcome>`; `contract_optimization_unit_graph(&LoadPointTopology, &[LoadPointGroup]) -> Vec<OptimizationUnitEdge>`. `OptimizationUnitEdge` heeft twee canoniek geordende unitindices `from_unit: usize`, `to_unit: usize`. Groepspartitionering is vóór contractie gevalideerd. `PreparedIlpProblem` is intern Rust en bezit gesorteerde units, kandidaatconfiguraties met kosten, vaste buitenlabels per limietsoort, geldige vaste buitenburen, unitverbindingen en waarschuwingen.

- [ ] Maak testhelpers in `test_support.rs`: `binary_cost_fixture()` en `joint_limit_fixture()`, beide als volledige `IlpOptimizationInput`. De eerste bevat twee ongegroepeerde buurpunten, twee technisch geldige configuraties en bekende kosten 10 en 12 per locatie; de tweede twee units met gedwongen verschillende ppn én afmetingen. Maak brondata via de bestaande core-testpatronen, niet via vervalste reeds-goedgekeurde solveruitkomsten.
- [ ] Test selectie-uitbreiding naar volledige groepen, ontbrekende analyses, technische leegte, actieve-kandidaatfilters, ontbrekende kosten, conflicterende locks en groepsleden met verschillende opties. Toon het probleem vóór implementatie met de gerichte testcommandos.
- [ ] Hergebruik bestaande technische voorbereiding, maar reconstrueer alle gevraagde units en classificeer ook units die `prepare_optimization_units` momenteel weglaat. `technical_unassigned_load_point_ids` is geen toestemming om een unit stilzwijgend te verwijderen.
- [ ] Splits diagnostics in lokale kandidaatleegte, invoerproblemen (`missing_analysis_data`, `missing_relevant_cost`, `missing_pile_head_level`, `invalid_group_partition`) en de bestaande specifieke lockproblemen. Geef bij lokale leegte een specifieke code: `missing_capacity_data`, `insufficient_capacity`, `no_common_group_configuration`, `candidate_filter_excludes_all` of `utilization_limit_excludes_all`. Alleen een daadwerkelijk vastgesteld leeg domein maakt de actie voor het selecteren van oplosbare units beschikbaar; een ontbrekend analyseresultaat of kostentabelprobleem doet dat niet. Bij meerdere oorzaken mogen meerdere diagnostics dezelfde unit beschrijven.
- [ ] Behoud de lockuitzonderingen uit de specificatie: een geforceerde configuratie kan buiten de kandidaten liggen; vergrendelde leden hebben de bestaande benuttingsuitzondering, onvergrendelde groepsleden niet. Alle geforceerde opties moeten technisch beschikbaar zijn.
- [ ] Bereken de oorspronkelijke Gabriel-topologie op alle projectpunten. Contracteer met een `BTreeSet` van `(min(unit_a,unit_b), max(...))`, verwijder self-edges. Pas doel/buiten-scope daarna toe; bouw geen nieuwe graaf bij uitsluiting of selectie.
- [ ] Houd vaste buitenlabels voor variatiemaxima los van technisch geldige vaste buitenburen voor de score. Ongeldige of intern gemengde buitenunits leveren geen score-verbinding maar wel een waarschuwing; bestaande individuele buitenconfiguraties blijven voor whole-plan-limieten meetellen.

```rust
// Specifiek contractievoorbeeld, met helpers/fixtureconstructie in dezelfde testmodule.
// Unit A={1,2}, B={3}; oorspronkelijke edges 1--2, 1--3, 2--3.
let edges = contract_optimization_unit_graph(&topology, &groups);
assert_eq!(edges, vec![OptimizationUnitEdge { from_unit: 0, to_unit: 1 }]);
```

- [ ] Voeg het regressiegeval toe waarbij een uitgesloten middenpunt de oorspronkelijke verbinding tussen twee resterende punten blokkeert. Na uitsluiting mag die verbinding niet alsnog ontstaan.
- [ ] Controleer kosten als som van `n_u*k_c` en dat dezelfde configuratie in elke unit dezelfde eenheidskosten krijgt. Valideer overflows vóór modelopbouw.
- [ ] Retourneer `Blocked` met `empty_target` wanneer geen doelunit overblijft. Start daarvoor geen solver en bied geen lege selectieactie aan.

**Verificatie:** `cargo test -p pile-plan-core optimization` en `cargo test -p pile-plan-core tip_level_regions`; bestaande greedytests moeten ongewijzigde betekenis houden.

## Taak 4 — Exact good_lp-model en onafhankelijke resultaatcontrole

**Nieuw:** `crates/pile-plan-core/src/optimization/ilp/{model.rs,validate.rs,model_tests.rs,oracle_tests.rs}`.

**Interfaces:** `IlpModelObjective` heeft `Cost` en `Transitions`; `build_ilp_model(&PreparedIlpProblem, IlpModelObjective, Option<u64>, &IlpTransitionWeights)` bouwt het concrete good_lp/microlp-model met een indexkaart van x-variabelen. Het concrete returntype volgt de in taak 0 geteste API en blijft privé. `validate_ilp_assignment(&PreparedIlpProblem, &[IlpAssignment], Option<u64>, &IlpTransitionWeights) -> Result<ValidatedIlpAssignment, IlpValidationError>` controleert de oplossing zonder solverhulvariabelen te vertrouwen. Deze twee interne resulttypes bevatten respectievelijk toewijzingen/kosten/tellingen/score en een foutcode met betrokken locatie-ids.

- [ ] Schrijf eerst een exhaustieve oracle voor maximaal vijf units en vier configuraties per unit. Enumereer toewijzingen onafhankelijk van de ILP-constraints, toets technische domeinen en limieten, bereken kosten en score rechtstreeks uit labels. Vergelijk optimale **waarden**, niet de exacte toewijzing bij meerdere optima.
- [ ] Voeg x-binaries uitsluitend voor toegestane unit/configuratieparen toe, met `sum_c x[u,c] = 1`. Fixeer gedwongen configuraties. Gebruik dezelfde constraints voor beide fasen.
- [ ] Voeg exacte OR-indicatoren voor gebruikte configuraties, tips en maten toe: indicator minstens elke relevante x en hoogstens hun som. Zet reeds buiten gebruikte labels op 1 bij whole-plan. Tellen is een unie, geen optelling van interne en externe aantallen. Voeg uitsluitend ingeschakelde maxima toe.
- [ ] Maak in de ruimtelijke fase onehot-expressies per tip en maat. Bouw exact dT/dS met de onder- én bovengrenzen uit specificatie §7, inclusief constante labels van geldige buitenburen. Bouw hTS als exacte AND. Laat externe-externe edges weg. De kostenfase heeft deze wisselingsvariabelen niet nodig.
- [ ] Bouw de score met een **getekende** interactiecoëfficiënt. Vermijd unsigned underflow bij gamma kleiner dan alpha+beta:

  ```rust
  let interaction = i64::from(weights.both_milli)
      - i64::from(weights.tip_only_milli)
      - i64::from(weights.size_only_milli);
  // Doel per edge: tip_only_milli*dT + size_only_milli*dS + interaction*hTS.
  ```

- [ ] Voeg de gehele kostenbudgetconstraint toe voor de ruimtelijke fase; de kostenfase heeft geen budget. Bouw `cost = sum n_u*k_c*x[u,c]`. Vermijd productvariabelen, edge-multipliciteiten en een verborgen epsilon-kostendoel.
- [ ] Implementeer onafhankelijke controle: exact één assignment per doellocatie, geen buitenmutaties, groepsgelijkheid, lidmaatschap van kandidaatdomeinen, locks, alle actieve caps en budget. Extractie accepteert alleen bijna-gehele x-waarden binnen een expliciete numerieke tolerantie; een fractioneel/ongeldig resultaat is `Failed`, geen afgeronde succesvolle oplossing.
- [ ] Herbereken aantallen, kosten en 0/alpha/beta/gamma-score uit de gevalideerde configuraties met gecontroleerde integerrekenkunde. Controleer coëfficiënten én mogelijke totalen tegen de veilige numerieke range.

```rust
// Rechtstreekse scoretest; dezelfde cases ook door het echte model oplossen.
for (tip_diff, size_diff, expected) in [
    (false, false, 0_i64), (true, false, 1000),
    (false, true, 3000), (true, true, 500),
] {
    let score = 1000 * i64::from(tip_diff)
        + 3000 * i64::from(size_diff)
        + (500 - 1000 - 3000) * i64::from(tip_diff && size_diff);
    assert_eq!(score, expected);
}
```

- [ ] Test nulgewichten, gamma=0, gamma kleiner/groter dan de som, vier scopecombinaties, buitenlabels buiten de kandidaatcatalogus en verschillende unitgroottes. Voeg een validator-test met doelbewust beschadigde solverextractie toe.

**Verificatie:** `cargo test -p pile-plan-core optimization::ilp`; oracle-tests deterministisch met kleine begrensde domeinen houden, geen timinggevoelige prestatietests in de gewone suite.

## Taak 5 — Twee fasen, referentiebeheer en behulpzame limietdiagnose

**Nieuw:** `crates/pile-plan-core/src/optimization/ilp/{backend.rs,session.rs,reference.rs,diagnose.rs,session_tests.rs,diagnose_tests.rs}`.

**Interfaces:** Publieke `IlpOptimizationSession::new()` en `run(&mut self, IlpRunRequest, &mut dyn FnMut(IlpProgress), &dyn Fn() -> bool) -> IlpOptimizationOutcome`. De laatste callback leest annulering; de sessie leeft op de rekenachtergrond. Adapters voorzien voortgang van de run-id en sturen precies één `Finished` voor de geretourneerde uitkomst. Alleen deze sessie kan een referentie hergebruiken. De backend vertaalt feitelijke solveruitkomsten naar proof, termination, eventueel incumbent en eventueel gemeten bound/gap; taak 0 bepaalt de concrete library-methoden.

- [ ] Test de faseovergang: eerst kosten, daarna score binnen budget. Een bewezen optimum in fase 1 krijgt `Optimal`; een geldige tijdgelimiteerde referentie krijgt `Feasible` en behoudt dat label in het uiteindelijke resultaat.
- [ ] Maak een canonieke referentiesleutel van de feitelijke kostendomeinen, kosten, doelunits, groepen, locks, harde limieten en de voor die limieten relevante buitenlabels. Bewaar naast een eventuele hash ook de canonieke inhoud om foutief hergebruik door een hashbotsing uit te sluiten.
- [ ] Laat uitsluitend wijzigingen van budget, scoregewichten en aansluiten op buitenburen dezelfde kostenreferentie hergebruiken. Scoretopologie/buitenburen worden voor iedere run wel ververst. Andere gewijzigde invoer wordt conservatief opnieuw voorbereid; hergebruik kan alleen bij bewezen identieke harde kostenvoorwaarden.
- [ ] Houd de referentie ook na een ruimtelijke run met tijdlimiet vast. Gebruik een ruimtelijke uitkomst nooit ongemerkt als nieuwe kostenreferentie. Een relevante wijziging of expliciete nieuwe sessie start een nieuwe referentie.
- [ ] Bereken het budget integer, met overloopcontrole:

  ```rust
  fn budget_from_reference(cost: u64, basis_points: u32) -> Option<u64> {
      let scaled = u128::from(cost)
          .checked_mul(10_000 + u128::from(basis_points))?;
      u64::try_from(scaled / 10_000).ok()
  }
  assert_eq!(budget_from_reference(101, 300), Some(104));
  assert_eq!(budget_from_reference(101, 0), Some(101));
  ```

- [ ] Gebruik de gevalideerde kostenreferentie als beschikbare ruimtelijke incumbent en, waar de backend dit ondersteunt, als startoplossing. Als fase 2 geen betere oplossing vindt voor zijn tijdslimiet, is de referentie nog steeds een geldige volledige oplossing. Bewezen onhaalbaarheid van fase 2 bij dezelfde harde voorwaarden en niet-negatief budget is `Failed { code: "reference_budget_inconsistency" }`.
- [ ] Laat stoppen en verlopen deadlines via de bewezen strategie uit taak 0 doorlopen. Check ook tussen voorbereiding, faseovergang en diagnose. Emit fases zonder verzonnen percentage; onbekende bounds/gaps blijven onbekend.
- [ ] Start limietdiagnose alleen bij bewezen gezamenlijke onhaalbaarheid, nadat lokaal/invoer/locks geldig zijn. Bouw per ingeschakelde cap Δ en r met `r <= Δ <= M*r`; M is de maximale zinvolle verhoging uit de volledige beschikbare labelunie. Onbeperkte caps krijgen geen r of Δ.
- [ ] Los lexicografisch op: eerst minimaal aantal verhoogde caps; fixeer het gevonden optimale aantal en minimaliseer daarna totale verhoging. Gebruik geen willekeurige gewogen menging. Een tijdgelimiteerd voorstel mag uitsluitend een gecontroleerde haalbare witness tonen en krijgt `minimality_proven=false`; bewijs niet impliceren.
- [ ] Controleer de witness met de voorgestelde limieten en alle overige oorspronkelijke voorwaarden. Geen kostenbudget in deze diagnose, geen automatische toepassing. Een gekozen verhoging invalideert de kostenreferentie en vereist een nieuwe run.
- [ ] Test dat `joint_limit_fixture()` gelijktijdige verhogingen kan voorstellen. Test tevens dat ontbreken van een haalbare witness, tijdlimiet en annulering geen onbewezen advies of melding 'geen oplossing mogelijk' opleveren.

**Verificatie:** gerichte session/diagnose-tests en de oracle-suite. Voeg een metamorfische test toe: bij bewezen optima en gelijke referentie kan een ruimer budget de optimale score niet verhogen. Doe deze assertion niet op tijdgelimiteerde uitkomsten.

## Taak 6 — ILP-knoppen naast greedy en instellingen in het zijpaneel

**Nieuw onder `apps/pile-plan-studio/src/`:**

- `components/domain/pile-plans/ilp-optimization/{IlpOptimizationSettingsPanel.tsx,ilpOptimization.css,IlpOptimizationResultPanel.tsx,ilpOptimizationViewModel.ts,ilpOptimizationViewModel.test.ts}`;
- `domain/pile-plans/ilp-optimization/{ilpSettingsModel.ts,ilpSettingsModel.test.ts}`.

**Wijzigen:** `components/template/ribbon/{Ribbon.tsx,Ribbon.css,Ribbon.test.ts}`, `components/domain/right-panel/{RightPanel.tsx,RightPanel.test.ts}`, `i18n/locales/{nl,en}/{ribbon.json,rightPanel.json}`, `integration/WorkspaceTranslations.test.ts`.

**Interface:** Beide featureviews consumeren de types uit taak 1. Instellingscallbacks leveren nieuwe settings/sessiewaarden op; `onRun`, `onStop`, `onSelectSolvable`, `onApplyLimitProposal` zijn callbacks zonder solverlogica. Tot taak 8 worden de views tegen contractfixtures en kleine statecallbacks ontwikkeld. Geen nieuwe technische berekeningen in TypeScript.

- [x] Gebruikerscorrectie tijdens uitvoering: voeg twee ILP-knoppen (Uitvoeren/Instellingen) direct naast greedy toe in de bestaande Plan-tab. Plaats alle instellingen in het zijpaneel met de bestaande paneelprimitieven; er komt geen extra tab.
- [ ] Implementeer een pure decimale invoerparser `parseScaledDecimal(text: string, decimals: number): number | null` zonder binaire float-vermenigvuldiging. Accepteer Nederlandse komma of punt, geen negatief/NaN/Infinity/exponentnotatie, maximaal de getoonde precisie. Houd tijdelijk ongeldige tekst lokaal; commit alleen een geldige waarde.

  ```typescript
  assert.equal(parseScaledDecimal("3,25", 2), 325);
  assert.equal(parseScaledDecimal("0.125", 3), 125);
  assert.equal(parseScaledDecimal("-1", 3), null);
  assert.equal(parseScaledDecimal("0.0001", 3), null);
  ```

- [ ] Label gewichten 'Alleen ander puntniveau', 'Alleen andere afmeting', 'Puntniveau én afmeting'. Voeg een korte toelichting toe dat de derde waarde de totale straf is. Toon de twee onafhankelijke buiten-scopecontrols alleen als relevant voor selectie; behoud hun waarden bij tijdelijk overschakelen naar alle locaties.
- [ ] Toon fases, referentiekwaliteit, referentiekosten, budget, werkelijke doelkosten, variatietellingen, drie soorten wisselingen, score en solverstatus. Maak geen zelfstandig optimumlabel afgeleid van `termination=completed`; gebruik het expliciete bewijsveld per fase.
- [ ] Toon diagnoses met betrokken locaties en de actie 'Selecteer oplosbare belastingspunten'. Toon limietverhogingen afzonderlijk als voorstel met expliciete knop; geen automatisch toepassen of runnen.
- [ ] Voeg NL/EN-strings en vertalingstests in dezelfde wijziging toe. Controleer met fixtures alle statussen: voorbereiding geblokkeerd, onhaalbaar met/zonder voorstel, geen oplossing binnen tijd, feasible resultaat, optimum, stoppen en fout.
- [ ] Controleer de ribbon in browserpreview bij 1280×800 en 1920×1080, compact baseline, NL en EN, 100% en 125% zoom. Behoud de bestaande 94px-hoogte, bereikbaarheid met toetsenbord en zichtbare foutlabels. Uitklapbediening mag geen controls buiten beeld onbereikbaar maken.

**Verificatie:** gerichte settings/viewmodel/ribbon/rightpanel/vertalingstests en visuele inspectie. Viewmodeltests toetsen statusbetekenis en beschikbaarheid van acties; geen tests die alleen de JSX-tekst dupliceren.

## Taak 7 — Selectieacties en atomair toepassen op een palenplan

**Nieuw:** `apps/pile-plan-studio/src/domain/pile-plans/ilp-optimization/{ilpResultApplication.ts,ilpResultApplication.test.ts,ilpSelectionActions.ts,ilpSelectionActions.test.ts}`.

**Interfaces:** `selectSolvableIlpTargets(outcome: IlpOptimizationOutcome) -> number[] | null` gebruikt uitsluitend Rusts ids bij een `Blocked`-uitkomst met lokale kandidaatleegte; `null` betekent dat de actie niet beschikbaar is. De oorspronkelijke doelset kan alle locaties zijn en is dus niet noodzakelijk gelijk aan de zichtbare selectie. `applyIlpSolutionToPlan(plan: PilePlanData, solution: IlpSolution) -> PilePlanData` maakt een immutable patch van de gecontroleerde doelassignments. Nieuwe-planaanmaken gebruikt het bestaande `createOptimizationPilePlan` uit `domain/pile-plans/pilePlanManagement.ts` met de ILP-patch. Geen hergebruik van greedy-toepassing als die onbehandelde locaties wist.

- [ ] Schrijf eerst tests met een bestaande toewijzing binnen het doel, een uitgesloten onoplosbare unit en een buitenlocatie. Een ILP-patch wijzigt alleen de doelassignments en hun relevante optimizeruitkomsten; uitgesloten en buitenlocaties blijven identiek.
- [ ] Implementeer selectie van Rusts oplosbare ids binnen het oorspronkelijke doel. Schakel daarbij de ILP-scope op selectie. Behoud volledige units zoals door Rust geleverd. De actie wijzigt geen palentoewijzingen en start geen run.
- [ ] Implementeer immutable patching van `selectedPileConfigurationsByLoadPoint`: nieuwe maps en gewijzigde planobjecten, behoud locks en niet-betrokken optimizeruitkomsten. Verwijder oude `optimizationUnassignedByLoadPoint`-meldingen uitsluitend voor toegewezen doelpunten. Behoud of ververs `externalReferencesByLoadPoint` volgens de bestaande regels voor gewijzigde configuraties; geen technische herkeuring in TS.
- [ ] Test bestaand plan versus nieuw plan. Het nieuwe plan krijgt een unieke naam via de bestaande naamgeving; het bronplan blijft intact. Activering van benodigde legendaconfiguraties volgt de bestaande projectregels.
- [ ] Zorg dat een succesvolle volledige toepassing één projecthistory-actie is. De controller uit taak 8 bewaakt dat stale/geannuleerde uitkomsten deze functie nooit bereiken.

```typescript
// Kernasserties, met before/solution uit de lokale volledige planfixture.
const after = applyIlpSolutionToPlan(before, solution);
assert.notEqual(after, before);
assert.notEqual(after.selectedPileConfigurationsByLoadPoint, before.selectedPileConfigurationsByLoadPoint);
assert.deepEqual(after.selectedPileConfigurationsByLoadPoint.get(outsideId),
  before.selectedPileConfigurationsByLoadPoint.get(outsideId));
assert.deepEqual(after.selectedPileConfigurationsByLoadPoint.get(excludedId),
  before.selectedPileConfigurationsByLoadPoint.get(excludedId));
```

**Verificatie:** gerichte selectie/resultaat-tests plus bestaande pile-plan-managementtests. Integreer undo/redo-verificatie met taak 8.

## Taak 8 — Worker, native achtergrondtaak en runtimecontroller

**Nieuw:**

- `crates/pile-plan-wasm/src/ilp_optimization.rs`;
- `apps/pile-plan-studio/src-tauri/src/ilp_optimization.rs`;
- `apps/pile-plan-studio/src/core/{ilpOptimizationClient.ts,ilpOptimization.worker.ts,ilpOptimizationClient.test.ts}`;
- `apps/pile-plan-studio/src/app/optimization/{ilpOptimizationController.ts,ilpOptimizationController.test.ts}`.

**Wijzigen:** WASM `src/lib.rs`, Tauri `src/main.rs`, frontend `core/coreClient.ts`, `app/session/AppSession.tsx`, `domain/project/projectState.ts`, `AppOptimization.test.ts`. Bewerk transporthelpers uitsluitend waar nodig; importeer geen Tauri-transport in de Worker.

**Interface:**

```typescript
export type IlpRunHandle = {
  finished: Promise<IlpOptimizationOutcome>;
  cancel(): void;
};
export interface IlpOptimizationClient {
  start(request: IlpRunRequest, onProgress: (event: IlpProgress) => void): IlpRunHandle;
  dispose(): void;
}
```

`IlpRunRequest` gebruikt de contractconversies uit taak 1. De client behandelt transport, geen kosten of score. De controller bezit de actuele run-id, immutable invoersnapshot en project/planidentiteit, en accepteert een resultaat alleen als deze nog bij de actuele projectinhoud en runinstellingen horen.

- [ ] Test eerst met een fake client: run A start, relevante invoer wijzigt, run B start, A eindigt later. Alleen B mag worden toegepast. Voeg varianten toe voor projectwissel, undo, planwissel, gewijzigde kosten/locks/groepen/analyses/selectie en unmount.
- [ ] Maak een dunne WASM-sessiewrapper om `IlpOptimizationSession`. Laat de Worker zelf zijn WASM-instance initialiseren en één actieve run uitvoeren. Gebruik `new Worker(new URL("./ilpOptimization.worker.ts", import.meta.url), { type: "module" })` en serialiseer via het browsercontract.
- [ ] Behoud de sessie tussen niet-geannuleerde runs voor kostenreferentiehergebruik. Bij Worker-terminatie gaat die cache verloren en wordt de referentie opnieuw berekend; rapporteer dat eerlijk. Stop altijd ook de promise/eventafhandeling; laat geen run eeuwig pending.
- [ ] Registreer Tauri start/cancel-commando's en getypeerde events met run-id. Voer de core in een blocking achtergrondtaak uit, met atomic cancelvlag conform taak 0. Houd geen mutex vast gedurende het oplossen; deel geen mutable solversessie tussen twee threads.
- [ ] Bewaar een native sessie tussen opvolgende runs zolang invoerhergebruik geldig is. Scherm de task lifecycle af bij sluiten/wisselen en voorkom starten van een tweede solve voordat de eerdere eigenaar is beëindigd. Een geregistreerd stopverzoek is nog geen gestopte native solver: toon desnoods kort 'Stoppen…'.
- [ ] Maak de client paritytests met dezelfde request/outcome-fixtures voor native en browser. Test Worker-crash, native invoke-fout, onbekende run-id, annulering en late eindberichten. Geen van deze fouten verandert het palenplan.
- [ ] Koppel de controller in `AppSession.tsx` via gerichte helpers; voeg geen tweede enorme optimizerclosure toe. Voortgang gebruikt tijdelijke state; instellingswijziging en resultaattoepassing gebruiken `commitProjectState`.
- [ ] Blokkeer gelijktijdige greedy- en ILP-runs die hetzelfde project willen wijzigen. Geef alle relevante wijzigingen een runinvalidatie. De sterke resultaatsleutel omvat óók budget, gewichten, grensscorekeuze en opslagkeuze; de beperktere kostenreferentiesleutel blijft in Rust.
- [ ] Koppel voorsteltoepassing als expliciete settingswijziging; laat de gebruiker opnieuw optimaliseren. Koppel selectie van oplosbare locaties en resultaatpaneel. Pas alleen `Solved` van een actuele niet-geannuleerde run toe.
- [ ] Test undo/redo van een toegepast resultaat, opslaan/heropenen met afzonderlijke instellingen, stop vlak vóór resultaatontvangst en stoppen tijdens elke fase. De planinhoud blijft na stop ongewijzigd.

**Verificatie:** `cargo test --workspace`; `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`; gerichte frontendcontroller/clienttests; `npm run build`. Voer daarna één echte browserrun en één echte Tauri-run inclusief stoppen uit.

## Taak 9 — Eindvalidatie, prestaties en documentatie

**Nieuw:** `crates/pile-plan-core/examples/ilp_benchmark.rs`, `docs/designs/2026-09-18-ilp-performance.md`.

**Wijzigen:** `docs/architecture.md`, `docs/domain-ownership.md` en `docs/known-limitations.md` voor de nieuwe optimizer, opslag en gemeten beperkingen. Vul het solverproefdocument aan met de definitief geteste versies en capabilities. Geen release notes, versiebump of vervangende deploymentconfiguratie.

- [ ] Draai alle verplichte verificatiecommando's na integratie:

  ```powershell
  cargo test --workspace
  cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
  ```

  Vanuit `apps/pile-plan-studio`:

  ```powershell
  npm test
  npm run build
  npm run tauri -- build --no-bundle
  ```

- [ ] Meet release-native en release-WASM op `sample_project/sample_project.ifcpp`, plus deterministische kleine/medium gevallen met eilanden, uitlopers, ongelijke dichtheid, groepen en locks. Het voorbeeldproject bevat circa 328 locaties vóór groepscontractie; rapporteer daadwerkelijk aantal units, kandidaatparen, edges en binaries per test.
- [ ] Meet voorbereiden/graafopbouw, eerste geldige oplossing, kostenreferentie en ruimtelijke fase afzonderlijk. Vergelijk budgetten 0%, 5% en 10%, meerdere configuratielimieten en tijdvensters 5, 15, 30 en 60 seconden. Noteer score, kosten, bewijsstatus, beschikbare werkelijke gap en maximale stopvertraging. Markeer een niet-beschikbare gap als onbekend.
- [ ] Selecteer op basis van die metingen een bruikbare standaardrekentijd en leg de onderbouwing vast. Als microlp te traag blijkt, rapporteer de gemeten beperking en een gerichte vervolgstap; voeg geen tweede backend toe binnen dit plan.
- [ ] Vergelijk greedy primair met de ILP-kostenreferentie onder dezelfde technische voorwaarden. Sluit greedy-resultaten met onopgeloste units of overschreden harde ILP-limieten uit van een directe kwaliteitsclaim. Vergelijk de ruimtelijke score alleen voor volledige geldige plannen.
- [ ] Controleer visueel de vier selectiescopecombinaties, ongeldige buitenbuur, lege lokale unit, voorstel dat twee maxima verhoogt, tijdgelimiteerd resultaat, Nederlandse/Engelse labels en compact ribbongebruik. Controleer dat paneel en tekening overeenkomen na nieuw plan, undo en heropenen.
- [ ] Controleer native bestandsopslag/heropening en applicatiesluiting tijdens rekenen in Tauri. Browser Worker-import en assetpaden moeten werken in de productiebuild, niet alleen in de devserver.
- [ ] Werk documentatie bij: model in Rust, dual-stage lifecycle, onafhankelijke instellingen, schema-normalisatie, stopgedrag, referentiehergebruik en gemeten beperkingen. Houd greedy beschikbaar en benoem verwijdering uitsluitend als afzonderlijk vervolg.
- [ ] Laat de geïntegreerde wijziging reviewen op contractpariteit, exact model, reference caching, foutclassificatie, immutable toepassing en UI-bruikbaarheid. Verhelp bevindingen en herhaal alleen de daardoor geraakte checks.

**Klaar wanneer:** het model de oracle-toetsen doorstaat; geen gedeeltelijke of stale uitkomsten worden toegepast; native en browser dezelfde engineeringregels uitvoeren; instellingen onafhankelijk werken en compatibel worden opgeslagen; UI/stopgedrag werkelijk zijn bekeken; test- en meetresultaten zijn vastgelegd. 'Optimale oplossing' wordt alleen getoond wanneer het bewijs daarvoor beschikbaar is.

## Dekkingscontrole tegen de specificatie

| Ontwerponderdeel | Taken |
| --- | --- |
| Doel, units, groepen, locks en `n_u*k_c` | 3, 4 |
| Twee onafhankelijke selectiescopes, vaste buitenlabels | 1, 3, 4, 6, 9 |
| Gabriel-contractie zonder multipliciteit/nieuwe edges | 3, 4 |
| Exacte x/usage/dT/dS/hTS en alpha/beta/gamma | 4 |
| Kostenreferentie, budget, hergebruik, geen kostentiebreak | 4, 5, 8 |
| Expliciete uitsluiting lokaal lege units | 3, 6, 7 |
| Gezamenlijk onhaalbare caps en gevalideerde voorstellen | 5, 6, 8 |
| Numerieke correctheid en onafhankelijke resultaatcontrole | 1, 4, 5 |
| Tijdlimiet, onbekend bewijs, annulering en stale resultaten | 0, 1, 5, 8 |
| ILP-ribbongroep, zijpaneel en afzonderlijke greedy/ILP-instellingen | 2, 6, 7, 8 |
| Opslag, historie, migratie en dunne wrappers | 2, 7, 8 |
| Bilingual UI, compact layout, native/WASM en metingen | 6, 8, 9 |
| good_lp/microlp, latere optionele HiGHS-route | 0, 4, 5, 9 |

## Overdracht

Eerst taken 0–2 afronden en de contractfixtures delen. Daarna taken 3–5 en 6–7 als twee afgebakende werkpakketten uitvoeren. De integrator verzorgt taak 8 en begeleidt taak 9. Er is geen implementatie of agentdispatch gestart door het schrijven van dit plan.

## Uitvoeringsstand 18 september 2026

De kern, contracten, opslag, UI en runtime zijn geïmplementeerd in de huidige
werkmap op `ilp-optimalisatie`. Er zijn geen commits gemaakt. De checkboxlijst
hierboven blijft de oorspronkelijke detailchecklist; onderstaande bewijsstukken
geven de daadwerkelijk uitgevoerde controles weer.

- Core: exact tweefasenmodel, gezamenlijke limietdiagnose, referentiecache,
  Gabriel-contractie, locks, lokale diagnoses en onafhankelijke validatie.
- 192 kleine modelruns zijn vergeleken met volledige enumeratie, naast
  gerichte tests voor groepen, beide selectiescopes, vaste ongeldige buren,
  nulgewichten, negatieve interactieterm, budgetten, locks en annulering.
- IFCPP: afzonderlijke settings, defaults en migraties voor versies 1–4;
  import maakt direct canonieke ILP-instellingen.
- UI: herziene plaatsing naast greedy, bestaande paneelstijl, selectieactie
  boven diagnoses, Nederlandse en Engelse teksten.
- Worker en native achtergrondtaak; late/stale uitkomsten en stopverzoeken
  kunnen geen resultaat toepassen. Native cancel-before-start is afgedekt.
- Browserproductiebuild: daadwerkelijk gestart, gestopt, volledig resultaat
  toegepast als nieuw plan, undo en redo gecontroleerd.
- Native en WASM-release gemeten op het voorbeeldproject; zie
  [prestatieverslag](../designs/2026-09-18-ilp-performance.md).

Bewuste implementatiekeuzes: de referentie wordt kort lokaal verbeterd tot een
gevalideerde terugvaloplossing, zonder solver-warmstart. De getypeerde resume-route
van microlp blijft behouden. Samenhang kan uit; een nuldoelfunctie slaat de tweede
solve eveneens over. De selectie blijft behouden bij resultaattoepassing.
Niet-bindende configuratielimieten genereren geen overbodige usage-variabelen.
Selectieacties zijn samen met immutable resultaattoepassing ondergebracht.
De volledige voorgestelde benchmarkmatrix (alle geometrieën, limieten en
tijdvensters) is niet uitgevoerd; het verslag noemt uitsluitend gemeten cases.
