# ILP-metingen en validatie — 18 september 2026

## Aanvulling na gebruikersvoorbeeld: 6 ppn, 3 afmetingen, 20%, gewichten 1/0/1

De oorspronkelijke uitvoering is exact gereproduceerd: 303 locaties, referentie
208.176, budget 249.811, score 149. De ruimtelijke solver had na 30 s geen incumbent;
het resultaat was de kostenreferentie. Een afzonderlijke lokale zoekproef vond een
geldig tegenvoorbeeld met 56 wisselingen voor 218.117. Daarmee is aangetoond dat
de teruggegeven score niet optimaal was; de telling zelf klopte.

De uitvoering verbetert de referentie nu kort met strikt scoreverlagende wijzigingen
van één unit tegelijk. Budget, locks, groepskeuzes, buitenlabels en alle drie maxima
blijven hard. Deze stap gebruikt maximaal 500 ms en maximaal 10% van de resterende
rekentijd. Het gevalideerde resultaat is een terugvalplan voor de aansluitende ILP,
geen warmstart in microlp en geen bewijs van optimaliteit. Een nulscore vormt wél een
bewijs, omdat alle straffen niet-negatief zijn.

De gewijzigde native release-run gaf 55 wisselingen voor 218.145 terug, binnen
dezelfde limieten, na 30,62 s. De ILP vond binnen die tijd nog geen beter resultaat.
Ook het weglaten van ongewogen verschilvariabelen en de ongebruikte interactievariabele
is op zichzelf onvoldoende om dit voorbeeld binnen 30 s op te lossen.

De UI meldt expliciet wanneer de kostenreferentie of het lokaal verbeterde palenplan
wegens de tijdlimiet wordt teruggegeven. De schakelaar 'Samenhang optimaliseren'
schakelt de tweede fase uit en verbergt budget/gewichten zonder ze te wissen.
Nulgewichten slaan die fase eveneens over. Oudere projecten krijgen de schakelaar
ingeschakeld; de instelling wordt afzonderlijk van greedy opgeslagen.
Het maximale aantal verschillende configuraties staat bij nieuwe ILP-instellingen
standaard op onbeperkt. Een expliciet opgeslagen maximum blijft behouden.

Reproductie met de nieuwe benchmarkargumenten:

```powershell
cargo run --release -p pile-plan-core --example ilp_benchmark -- 30000 2000 0 - 6 3 1000 0 1000
```

De onderstaande oorspronkelijke metingen dateren van vóór deze verbeterstap.

Met dezelfde 303 locaties en maxima 6/3 kostte de native release-run met alle
gewichten nul 88 ms inclusief analyse/voorbereiding. Met samenhang uit was dat
90 ms. Beide gaven de bewezen kostenreferentie 208.176 terug zonder ruimtelijke
fase (de gemeten kostensolve was 54 ms).

Geteste afhankelijkheden: `good_lp 1.15.3` (defaultfeatures uit, alleen microlp),
`microlp 0.6.0`, `web-time 1.1.0`. Native release op Windows; release-WASM via
Node 24.20.0 en de productiepreview. Dit zijn afzonderlijke metingen op deze
werkplek, geen algemene prestatiegarantie.

## Reproductie

### Tweede gebruikersvoorbeeld: 4 ppn, 3 afmetingen, 10%, gewichten 1/1/2

De native release-run reproduceert de screenshot exact: 303 locaties,
kostenreferentie 212.096 (bewezen optimaal), budget 233.305, plan 214.332,
9 configuraties, 4 puntniveaus en 3 afmetingen. De score 88 bestaat uit
42 ppn-wisselingen, 32 afmetingswisselingen en 7 verbindingen waarop beide
verschillen (42 + 32 + 2 × 7). Dit zijn 81 verbindingen met een verschil.
Het teruggegeven palenplan is niet bewezen optimaal.

Met de huidige app-aansturing gaf de run met 600.000 ms tijdlimiet na
600,328 s nog steeds hetzelfde lokale plan terug: kosten 214.332, score 88,
bewijsstatus `Feasible`. Microlp had geen eigen spatial incumbent gevonden;
de laatste ondergrens was 22,5568966. De totale rekentijd twintigmaal verhogen
leverde dus geen beter plan of optimaliteitsbewijs op. Met 5 s intervallen
eindigde de diagnose na 302,370 s nog steeds op drie afgeronde zoekknopen,
zonder incumbent en met ondergrens 22,6788178.

De resultaatweergave toont nu afzonderlijk de kwaliteit van de kostenreferentie,
de kwaliteit van het palenplan en bij een terugval de herkomst van dat plan.
"Locally improved pile plan" / "Lokaal verbeterd palenplan" vervangt de
misleidende benaming "starting plan". De bewijsstatus van een geldige oplossing
zonder bewijs vermeldt expliciet "not proven optimal" / "niet bewezen optimaal".

```powershell
cargo run --release -p pile-plan-core --example ilp_benchmark -- 600000 1000 0 "$env:TEMP/ilp-long-request.json" 4 3 1000 1000 2000
```

De benchmark rapporteert iedere circa 30 s de solver-incumbent, ondergrens en
gap, plus de laatste voortgang bij afloop. Doelfuncties in deze logging zijn in
milli-eenheden: deel door 1000 voor de UI-score.

`ilp_time_slice_probe` is een afzonderlijke diagnose, geen gewijzigde app-solver.
Deze compileert de bestaande voorbereiding, modelbouw en validator rechtstreeks
mee en varieert alleen de interrupt/resume-intervallen. Argumenten: geëxporteerd
request, vastgesteld budget, interval in ms, totale rekentijd in ms.

De intervalproef laat een integratieprobleem zien: met 100 ms bleef het aantal
afgeronde zoekknopen op 1 staan, terwijl LP-iteraties bleven toenemen. Met 5 s
stagneerde dat aantal op 3. Een enkele solve-call van 180 s bereikte 67 knopen
in 181,26 s, nog zonder incumbent. De ondergrens was 22,6788178 in UI-eenheden.
Bij de gehele gewichten 1/1/2 betekent dat een ondergrens van 23; het geldige
lokale plan levert de bovengrens 88. Het optimum is hiermee niet bepaald.

Code-inspectie van microlp 0.6.0 (`mip/mod.rs`, `search_loop` en `visit_node`)
verklaart de stagnatie: bij een onderbroken node-LP gaat de node terug op de
zoeklijst, `last_solved_id` wordt gewist, en bij hervatten wordt de opgeslagen
ouderbasis opnieuw geladen. Een deelprobleem dat langer duurt dan de slice kan
daardoor herhaald werk uitvoeren. De huidige app-backend gebruikt slices van
100 ms. Een hogere totale tijdlimiet alleen lost dit niet op. Een vervolgaanpassing
moet voortgang behouden zonder Stop en de totale deadline uit het oog te verliezen.
Deze meetwijziging verandert de app-backend nog niet.

De diagnoseprocessen liepen deels gelijktijdig op dezelfde machine. Hun tijden
zijn daarom geen zuivere snelheidvergelijking; de stilstaande knooptellers en de
verschillende hoeveelheid afgerond zoekwerk zijn hier het relevante bewijs.

```powershell
cargo run --release -p pile-plan-core --example ilp_time_slice_probe -- "$env:TEMP/ilp-long-request.json" 233305 100 30000
cargo run --release -p pile-plan-core --example ilp_time_slice_probe -- "$env:TEMP/ilp-long-request.json" 233305 180000 180000
```

### Losse HiGHS-proef op exact hetzelfde model

`tools/ilp_highs_probe.py` exporteert de variabelen, de doelfunctie en alle
constraints rechtstreeks uit de bestaande `good_lp`-modelbouw. Een tijdelijke
kopie voegt alleen de exportcall toe, vóór de overdracht aan microlp. De
voorbereiding en onafhankelijke validatie komen eveneens uit de bestaande Rust-
broncode. De app, Cargo-dependencies en solverkeuze zijn hiervoor niet gewijzigd.
HiGHS is alleen als Python-package in een tijdelijke testmap geïnstalleerd.

Getest: HiGHS 1.15.1, één rekenthread, random seed 0, geen startoplossing,
`mip_rel_gap=0` en `mip_abs_gap=0`, tijdlimiet 300 s. Model: 4.923 binaire
variabelen, 19.713 constraints en 135.520 niet-nulcoëfficiënten. Instellingen
en selectie zijn identiek aan het tweede gebruikersvoorbeeld; budget 233.305.

| Moment | Beste gewogen score | Bewijs |
| --- | ---: | --- |
| 0,6 s | 335 | Geldig, niet optimaal bewezen |
| 89,7 s | 35 | Geldig, niet optimaal bewezen |
| 223,1 s | 34 | Geldig, niet optimaal bewezen |
| 234,8 s | 33 | Geldig, nog niet optimaal bewezen |
| 294,3 s | **33** | **Bewezen optimaal, gap 0%** |

Het definitieve plan is onafhankelijk door de bestaande Rust-validator
gecontroleerd: kosten **233.180** binnen budget **233.305**, **3 puntniveaus**,
**3 afmetingen**, **7 configuraties**. De score is 7 ppn-wisselingen +
22 afmetingswisselingen + 2 × 2 dubbele wisselingen = **33**. Er zijn dus
31 verbindingen met een verschil. Alle oorspronkelijke matrixrijen en binaire
variabelen zijn bovendien buiten de solver opnieuw op geldigheid gecontroleerd.

Het lokale plan had score 88, dus dit is **62,5% minder gewogen wisselingen**.
De kosten van 233.180 zijn die van één gevonden plan met minimale wisselingsscore;
er is conform de specificatie geen secundaire kostenoptimalisatie uitgevoerd.
De ILP is voor dit voorbeeld aantoonbaar oplosbaar. Het vinden van een goed plan
en het bewijzen van optimaliteit hebben wel verschillende rekentijden.

Aanvullend is exact hetzelfde model met het lokale plan (score 88) als gedeeltelijke
MIP-start en een tijdlimiet van 30 s getest. HiGHS accepteerde de startoplossing,
maar vond binnen 31,6 s geen verbetering: score 88, ondergrens 26, status
`Time limit reached`. Ook dat teruggegeven plan is opnieuw door Rust gevalideerd.
Een warmstart garandeert dus hier een goede terugval, maar maakt het optimum niet
automatisch binnen de huidige 30 s beschikbaar. Deze twee proeven draaiden na
elkaar, niet gelijktijdig.

Reproduceren na export van het request hierboven:

```powershell
python -m pip install --target "$env:TEMP/pile-ilp-highs-probe/python" highspy==1.15.1
python tools/ilp_highs_probe.py "$env:TEMP/ilp-long-request.json" 233305 300
python tools/ilp_highs_probe.py "$env:TEMP/ilp-long-request.json" 233305 30 "$env:TEMP/ilp-long-request.json.outcome.json"
```

De proef bewaart MPS, matrix-JSON, HiGHS-log, oplossing, Rust-validatie en
meetresultaten onder `%TEMP%/pile-ilp-highs-probe/run-300s/`.
De source-SHA256 was `06d36672cdda3e0d6881aef0e0be3c90ac35bd25396fabeadfa5afd6aba26859`;
de request-SHA256 was `d133d400ec8768238b1af926c3c69931416840ac63b4121a86ec9f982c5a2059`.

### Oorspronkelijke benchmark

Vanuit de repository:

```powershell
cargo run --release -p pile-plan-core --example ilp_solver_probe
cargo run --release -p pile-plan-core --example ilp_benchmark -- 5000 500
```

De benchmarkargumenten zijn rekentijd in ms, budget in basispunten en optioneel
maximum configuraties (0 is onbeperkt) en een pad om het request te bewaren.
Dat request kan ongewijzigd door `WasmIlpSession` worden gerekend nadat de twee
numeriek geïndexeerde objecten naar JavaScript Maps zijn omgezet.

Het voorbeeldproject bevat 328 locaties. De lokale diagnose benoemt 25 locaties
zonder bruikbare capaciteit; na de expliciete selectieactie blijven 303 locaties,
190 units, 4.197 kandidaatparen en 353 gecontracteerde edges over. Zonder bindende
variatiemaxima heeft het ruimtelijke model 5.256 binaire variabelen: 4.197 x en
3 per edge. De beginwaarden 16 ppn / 4 afmetingen / 64 configuraties zijn hier
niet-bindend; zulke maxima genereren geen overbodige usage-variabelen.

## Resultaten voorbeeldproject

Score hieronder is de leesbare wisselingsscore (gewichten 1/1/2), niet de intern
opgeslagen milli-score. In alle gevallen is de kostenreferentie bewezen optimaal:
206.654. De doelkosten tellen alleen de geselecteerde locaties.

| Runtime | Venster | Budget | Werkelijke tijd | Kosten / score | Ruimtelijk bewijs |
| --- | ---: | ---: | ---: | --- | --- |
| Native release | 5 s | 5% | 5,39 s | 206.654 / 200 | haalbaar, referentie teruggegeven |
| Native release | 15 s | 0% | 8,29 s | 206.654 / 200 | optimaal |
| Native release | 30 s | 5% | 30,05 s | 206.654 / 200 | haalbaar, referentie teruggegeven |
| Native release | 60 s | 10% | 60,25 s | 206.654 / 200 | haalbaar, referentie teruggegeven |
| Release-WASM, Node | 5 s | 5% | 5,72 s | 206.654 / 200 | haalbaar, referentie teruggegeven |
| Release-WASM, Node | 15 s | 0% | 11,13 s | 206.654 / 200 | optimaal |

Native analyse en benchmarkvoorbereiding namen circa 30–35 ms in beslag. Het
kostenresultaat verscheen 16–17 ms na start van de core-run. De eerste ruimtelijke
voortgang verscheen na 331–401 ms. Bij WASM waren die waarden respectievelijk
29–86 ms en 656–932 ms. Dat laatste omvat modelopbouw en de eerste solve-slice;
het is geen losse meting van uitsluitend modelopbouw.

De productiebrowserrun met 5% en 30 s gaf dezelfde kosten en score terug en maakte
één nieuw palenplan. Het paneel toonde 303 doelpunten, 17 configuraties,
11 puntniveaus, 4 afmetingen, 153 ppn-wisselingen, 5 afmetingswisselingen en
21 dubbele wisselingen. Ongedaan maken verwijderde alleen die nieuwe variant;
opnieuw herstelde dezelfde variant. Stoppen tijdens een eerdere run paste niets toe.

De gebouwde Tauri-desktopapp is ook handmatig gecontroleerd: dezelfde lokale
diagnose, selectie van 303 locaties, stoppen zonder wijzigingen en een volledige
run met 5% / 30 s die een nieuwe variant met dezelfde kosten maakte. Het nieuwe
zijpaneel is visueel gecontroleerd in Nederlands (licht en donker) en Engels
(licht); de selectieactie staat vóór de diagnostische meldingen.

## Interpretatie en standaard

De eerste standaardrekentijd is 30 s: voldoende voor de gemeten 0%-cases in
beide runtimes en begrensd voor moeilijkere modellen. Dit is een responsiviteitskeuze,
geen belofte dat 30 s een goede ruimtelijke oplossing geeft. Het positieve-budgetmodel
is op dit voorbeeld duidelijk te traag om microlp al als vervanger van greedy te
beschouwen. Ook 60 s met 10% leverde in deze meting geen verbetering op.

Er is geen gemeten gap beschikbaar voor de ruimtelijke terugvalresultaten; de UI
toont onbekende gaps niet als nul. Een gevonden referentie blijft stabiel zolang
de harde invoer gelijk is. Stoppen in de browser verwijdert de Worker én die cache.
Native stoppen gebruikt een atomic vlag tussen solve/resume-slices van maximaal
100 ms. Een solveroperatie of modelopbouw kan langer duren dan zo'n slice; een
harde bovengrens voor stopvertraging wordt daarom niet geclaimd.

De referentie is een gecontroleerde terugvaloplossing. Ze wordt nog niet als
warmstart aan microlp doorgegeven: good_lp biedt wel initial solutions, maar zijn
gebruikelijke solve-route verliest de getypeerde interrupted/resume-state zonder
incumbent. De huidige uitvoeringslaag gebruikt die getypeerde state rechtstreeks.
Een verdere optimalisatie van deze koppeling en/of een native HiGHS-backend is
gericht vervolgwerk. HiGHS is in deze wijziging niet toegevoegd.

## Correctheid en reikwijdte

- 48 deterministische kleine voorbeelden × 4 budgetten zijn vergeleken met alle
  mogelijke toewijzingen: exact referentiebedrag, budget, optimale score en
  monotonie bij verruimen van het budget.
- Gerichte tests dekken groepen, deduplicatie van edges, uitsluiting zonder nieuwe
  Gabriel-edges, vier combinaties van selectiescopes, ongeldige buitenunits,
  nulgewichten, negatieve interactieterm, locks, gezamenlijke limietverhogingen,
  referentiehergebruik, deadlines en annulering.
- Een gedeeld request wordt native en in de echte gegenereerde WASM opgelost.
  Beide vinden referentie 21, budget 22, kosten 22 en score 0.
- De solverprobe controleert typed infeasibility en hervatten na een nuldeadline.
- IFCPP-migraties 1–4, afzonderlijke instellingen en ongeldige instellingen zijn getest.
- Controller/transporttests controleren stale en late resultaten, workerfouten,
  cancellation-before-start native en het behoud van één actieve run.

De uitgebreide geometrie/limiet/tijd-matrix uit het oorspronkelijke plan is geen
uitgevoerde benchmark. Er wordt evenmin een algemene kwaliteitswinst ten opzichte
van greedy geclaimd; het voorbeeld bevat vooraf onoplosbare locaties die eerst
expliciet moeten worden uitgesloten.


## Controle van de ge�ntegreerde native backend

De Tauri-build activeert `native-highs` met highs 2.4.0 / highs-sys 1.15.0,
met gebundelde HiGHS 1.15.0. Dit verschilt van de standalone Python-proef
met HiGHS 1.15.1 hierboven; de eerdere doorlooptijden zijn geen garantie
voor de app. De C++-bibliotheek wordt geoptimaliseerd gebouwd, ook voor
Rust-ontwikkelbuilds. De solver gebruikt ��n thread en geen parallelle zoekactie.

Een ge�ntegreerde proef met dezelfde ge�xporteerde aanvraag en een limiet van
120 seconden leverde na 128,2 seconden het lokale plan met score 88 terug.
De gerapporteerde ondergrens liep op tot 25,842. De uitkomst werd correct als
`feasible` / `time_limit` en als lokale terugval gemarkeerd. Dit bevestigt ook
dat de tijdslimiet bij langdurige interne bewerkingen kan worden overschreden.
Een afzonderlijke annuleerproef met een verzoek na drie seconden stopte na
5,5 seconden met `cancelled`, zonder teruggegeven plan.

De frontend bewaart tussentijdse gevalideerde plannen voor Stoppen en gebruiken.
Transporttests controleren zowel het abrupt be�indigen van de browserworker
als de native onderbreking, een verbeterd plan tussen stop en afronding,
annuleren na stoppen, en het verwerpen van resultaten bij gewijzigde invoer.
