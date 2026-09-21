# Ruimtelijke optimalisatie binnen een kostenbudget

Datum: 18 september 2026

Issue: [#21 — Optimize for spatially coherent pile configurations](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/21)

Dit document legt het afgesproken wiskundige ontwerp vast. Het beschrijft nieuw
gedrag, niet de huidige werking van de greedy optimizer. Paragraaf 13 legt de
voorgestelde plaatsing in de app vast. Paragraaf 14 beschrijft de gekozen
solverrichting; de integratie en prestaties moeten nog worden gevalideerd. Het
implementatieplan valt buiten dit document.

## 1. Doel en afbakening

De optimizer bepaalt eerst een kostenreferentie en minimaliseert vervolgens
gewogen configuratiewisselingen binnen een door de gebruiker toegestaan
kostenbudget. Technische geldigheid, belastingspuntgroepen, vergrendelingen en
ingestelde maxima voor configuratievariatie blijven harde voorwaarden.

Een wisseling betreft een verbinding in een uit de Gabriel-graaf afgeleide
unitgraaf. Alleen een ander puntniveau, alleen een andere afmeting en beide
verschillen krijgen afzonderlijk instelbare gewichten. Afstandsweging,
geometrische randlengte, compactheid, aantallen verbonden gebieden en maxima
voor afmetingen per gebied maken geen deel uit van dit model.

Er is geen secundaire kostendoelfunctie na het minimaliseren van wisselingen.
Plannen met dezelfde wisselingsscore zijn gelijkwaardig wanneer zij beide aan
het budget en alle harde voorwaarden voldoen.

## 2. Invoer en optimalisatie-eenheden

Een unit bestaat uit een volledige belastingspuntgroep of een los
belastingspunt. Alle locaties binnen een unit krijgen dezelfde configuratie.
Een selectie wordt daarom uitgebreid tot volledige units.

| Symbool | Betekenis |
| --- | --- |
| U | Alle units in het project |
| A | De geselecteerde, te optimaliseren units |
| F = U \\ A | Units buiten de selectie |
| L_u | Oorspronkelijke locaties van unit u |
| n_u | Aantal locaties in L_u |
| C_u | Toegestane configuraties voor geselecteerde unit u |
| c = (s(c), t(c)) | Configuratie met afmeting s(c) en puntniveau t(c) |
| k_c | Kosten per locatie voor configuratie c |
| N_T, N_S, N_C | Maxima voor puntniveaus, afmetingen en configuraties |
| p >= 0 | Toegestane meerkosten als fractie, bijvoorbeeld 0,03 |
| alpha, beta, gamma >= 0 | Straffen voor alleen ppn, alleen afmeting, beide |

De standaardwaarden van alpha, beta en gamma zijn respectievelijk 1, 1 en 2.
Het standaardkostenbudget staat op 5% toegestane meerkosten (p = 0,05).
Configuratie-identiteit gebruikt de bestaande afmetings- en gehele
millimeterwaarden voor puntniveaus.

De Rust-core bepaalt C_u op basis van de geselecteerde CPTs, foundation advice,
gemeenschappelijke groepsmogelijkheden, kandidaatselectie, maximale benutting
en locks. De bestaande semantiek van locks blijft gelden: een geforceerde
configuratie mag kandidaatfilters passeren, maar moet technisch geldig zijn.
De bestaande uitzondering op de optimizerbenuttingsgrens voor vergrendelde
leden blijft behouden; onvergrendelde groepsleden blijven aan die grens voldoen.

Het huidige kostenmodel gebruikt een projectbreed paalkopniveau en
kosteninstellingen. Daardoor is k_c onafhankelijk van de unit. De totale
bijdrage van een unit is n_u maal de door de core berekende kosten per locatie.
De ILP-laag introduceert geen afwijkende afronding van paalkosten.

## 3. Twee onafhankelijke selectie-instellingen

| Instelling | Uit | Aan |
| --- | --- | --- |
| Configuraties buiten selectie meetellen | Variatiemaxima gelden binnen A | Variatiemaxima gelden voor A en bestaande toewijzingen in F |
| Aansluiten op omliggend palenplan | Alleen interne wisselingen tellen | Ook wisselingen naar vaste geldige buurconfiguraties in F tellen |

De eerste instelling correspondeert met het bestaande `target` / `whole-plan`.
De tweede is een afzonderlijke instelling. Beide uit betekent dat de selectie
als onafhankelijk deel wordt geoptimaliseerd. Toewijzingen buiten de selectie
blijven bij alle combinaties ongewijzigd.

Het kostenbudget heeft in alle gevallen alleen betrekking op A. Een groot
ongewijzigd projectdeel geeft dus geen extra bestedingsruimte aan een kleine
selectie. De instelling voor variatiemaxima geldt zowel bij het bepalen van de
kostenreferentie als bij het minimaliseren van wisselingen.

## 4. Unitgraaf

Bereken eerst de Gabriel-graaf op alle oorspronkelijke projectlocaties. Noem
zijn ongeordende verbindingen E_L. Definieer vervolgens:

```text
E_U = { {u,v} : u != v en er bestaan i in L_u, j in L_v met {i,j} in E_L }
```

Verbindingen binnen een unit vervallen. Meerdere locatieverbindingen tussen
hetzelfde unitpaar worden samengevoegd tot precies een verbinding. Er is geen
multipliciteitsfactor m_uv en geen afstandsgewicht. We berekenen geen
Gabriel-graaf op groepsmiddelpunten.

De selectie en het uitsluiten van onoplosbare units veranderen de onderliggende
graaf niet. Anders zouden nieuwe verbindingen kunnen ontstaan over weggelaten
locaties heen.

Voor de doelfunctie geldt:

```text
E_intern = { {u,v} in E_U : u in A en v in A }
E_grens  = { {u,v} in E_U : precies een eindpunt in A,
                           ander eindpunt heeft een vaste geldige configuratie }

E = E_intern                              als aansluiten uit staat
E = E_intern verenigd met E_grens         als aansluiten aan staat
```

Een externe unit kan als vaste buur dienen wanneer zijn locaties een
gemeenschappelijke, technisch geldige bestaande configuratie hebben. Zonder
zo'n eenduidige geldige configuratie nemen we zijn grensverbindingen niet op in
de score. Rapporteer deze ontbrekende vaste buurconfiguraties expliciet; vul ze
niet automatisch aan en kies niet willekeurig een groepslid als representant.

Verbindingen met beide eindpunten buiten A zijn constant en ontbreken in de
doelfunctie. De gerapporteerde optimalisatiescore betreft dezelfde edges E.

## 5. Toewijzing en locks

Voor iedere u in A en c in C_u bestaat een binaire variabele:

```text
x[u,c] = 1 als unit u configuratie c krijgt

som(c in C_u) x[u,c] = 1                  voor iedere u in A
```

Voor een geforceerde configuratie c_bar geldt:

```text
x[u,c_bar] = 1
```

Buiten C_u is x[u,c] per definitie nul. Groepsgelijkheid volgt direct uit het
gebruik van een variabele per unit, niet per groepslid.

Definieer de volgende lineaire uitdrukkingen:

```text
a[u,t] = som(c in C_u met t(c)=t) x[u,c]
b[u,s] = som(c in C_u met s(c)=s) x[u,c]
```

Door de precies-een-voorwaarde zijn deze uitdrukkingen automatisch nul of een.
Voor vaste externe buren zijn a[u,t] en b[u,s] bekende nul-eenconstanten van de
bestaande configuratie. Die buren krijgen geen beslisvariabelen.

## 6. Exact tellen van gebruikte configuraties

Neem voor C alle configuraties uit de kandidaatdomeinen van A en de relevante
bestaande externe toewijzingen. T en S bevatten de bijbehorende puntniveaus en
afmetingen, inclusief vaste labels die voor grenswisselingen nodig zijn.

Definieer bekende constanten f_c, f_t en f_s:

- Bij limietscope `target` zijn ze allemaal nul.
- Bij `whole-plan` zijn ze een als de configuratie, het puntniveau of de
  afmeting voorkomt in een bestaande toewijzing buiten A, anders nul.

Een bestaande toewijzing telt voor whole-plan-variatie ook wanneer deze buiten
de kandidaatselectie voor A ligt. Variatie tellen is een andere vraag dan
technische geldigheid controleren. Ongetoetste of ongeldige externe
toewijzingen worden door het optimalisatieresultaat niet geldig verklaard.

Introduceer binaire gebruiksvariabelen y_c, z_t en q_s met:

```text
y[c] >= f_c
y[c] >= x[u,c]                            voor iedere u in A
y[c] <= f_c + som(u in A) x[u,c]

z[t] >= f_t
z[t] >= a[u,t]                            voor iedere u in A
z[t] <= f_t + som(u in A) a[u,t]

q[s] >= f_s
q[s] >= b[u,s]                            voor iedere u in A
q[s] <= f_s + som(u in A) b[u,s]
```

Daarmee tellen we de vereniging van interne en eventueel externe configuraties,
zonder dubbeltellingen. De harde maxima zijn:

```text
som(c in C) y[c] <= N_C
som(t in T) z[t] <= N_T
som(s in S) q[s] <= N_S
```

Laat een uitgeschakelde limiet weg. Locks en meegetelde externe toewijzingen
vallen ook onder de harde maxima. Anders dan bij de huidige greedy optimizer
mag een bestaande overschrijding niet blijven bestaan enkel omdat die niet
verder toeneemt.

## 7. Exacte wisselingsindicatoren

Introduceer voor iedere e={u,v} in E binaire variabelen dT[e], dS[e] en hTS[e].

Voor ieder puntniveau t:

```text
dT[e] >= a[u,t] - a[v,t]
dT[e] >= a[v,t] - a[u,t]
dT[e] <= 2 - a[u,t] - a[v,t]
```

Voor iedere afmeting s:

```text
dS[e] >= b[u,s] - b[v,s]
dS[e] >= b[v,s] - b[u,s]
dS[e] <= 2 - b[u,s] - b[v,s]
```

De indicator voor beide verschillen is de exacte logische AND:

```text
hTS[e] <= dT[e]
hTS[e] <= dS[e]
hTS[e] >= dT[e] + dS[e] - 1
```

De boven- en ondergrenzen maken de indicatoren onafhankelijk van de
doelfunctie exact. Dit blijft nodig bij nulgewichten of wanneer
gamma - alpha - beta negatief is.

De score is:

```text
W = som(e in E) [alpha*dT[e] + beta*dS[e]
                + (gamma-alpha-beta)*hTS[e]]
```

| dT | dS | hTS | Straf |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 0 |
| 1 | 0 | 0 | alpha |
| 0 | 1 | 0 | beta |
| 1 | 1 | 1 | gamma |

Gamma is de totale straf voor beide verschillen, geen extra toeslag. Alle drie
gewichten zijn niet-negatief; gamma hoeft niet gelijk te zijn aan, of groter
te zijn dan, alpha + beta.

Voor de resultaatweergave zijn de aantallen:

```text
alleen_ppn       = som(e in E) (dT[e] - hTS[e])
alleen_afmeting  = som(e in E) (dS[e] - hTS[e])
beide           = som(e in E) hTS[e]
configuratiewisselingen = alleen_ppn + alleen_afmeting + beide
```

De gewogen score W is een andere grootheid dan het ongewogen aantal
configuratiewisselingen.

## 8. Twee optimalisatiestappen

De totale kosten binnen de selectie zijn:

```text
K(x) = som(u in A) n_u * som(c in C_u) k_c*x[u,c]
```

### Stap 1: kostenreferentie

Minimaliseer K(x), onder de voorwaarden uit paragrafen 5 en 6. De
wisselingsvariabelen zijn in deze stap niet nodig.

Bij bewezen optimaliteit heet de uitkomst K_star. Als een tijdslimiet alleen
een geldige oplossing oplevert, kan deze als K_ref worden gebruikt. Noem die
dan de beste gevonden kostenreferentie, niet de bewezen minimumkosten. Zonder
geldige referentie kan stap 2 niet starten.

### Stap 2: ruimtelijke samenhang

```text
B = floor((1+p) * K_ref)

minimaliseer W
onder de voorwaarden uit paragrafen 5, 6 en 7
en K(x) <= B
```

Gebruik exacte decimale of geschaalde gehele verwerking van p en de gewichten
om onbedoelde budgetafronding door drijvende-kommagetallen te vermijden.

De referentieoplossing past bij p >= 0 zelf binnen het budget. Met dezelfde
harde voorwaarden is stap 2 daarom wiskundig haalbaar zodra stap 1 een geldige
referentie heeft geleverd. Een solver die nog geen oplossing heeft gevonden,
heeft daarmee geen onhaalbaarheid bewezen. Een bewezen onhaalbaarheidsmelding
in stap 2 vereist controle van modelconsistentie, budget en invoerversie.

Geen secundaire kostenminimalisatie wordt toegevoegd. Het resultaat vermeldt
werkelijke kosten en budget, zonder een goedkoopste oplossing bij gelijke
wisselingsscore te beloven.

### Referentie vasthouden

Tijdens het vergelijken van budgetpercentages blijft K_ref vast. Een verandering
van de selectie, kandidaatdomeinen, locks, kosten, variatiemaxima of de relevante
externe configuraties bij whole-plan-scope maakt de referentie ongeldig.
Het veranderen van p, alpha, beta, gamma of alleen de instelling voor externe
wisselingen verandert op zichzelf het kostenprobleem niet.

Controleer asynchrone resultaten altijd tegen de actuele invoerversie voordat
zij op een palenplan worden toegepast. Een latere verbetering van de
kostenreferentie verschuift een lopende budgetvergelijking niet stilzwijgend.

## 9. Units zonder eigen oplossing

Onderscheid lokale onoplosbaarheid van gezamenlijke onhaalbaarheid:

- Lokaal: een unit heeft zelf geen toegestane configuratie, dus C_u is leeg.
- Gezamenlijk: alle deelnemende units hebben kandidaten, maar geen gezamenlijke
  toewijzing voldoet aan de globale maxima.

Bij lokale problemen toont de voorbereiding de betrokken units, het aantal
locaties en redenen. Houd ontbrekende brondata, onvoldoende capaciteit, geen
gemeenschappelijke groepsconfiguratie, kandidaatfilters, benuttingsgrenzen en
lockconflicten uit elkaar.

De actie **Selecteer oplosbare belastingspunten** vervangt het oorspronkelijke
doel door de volledige units daarbinnen die wel een toegestane configuratie
hebben en schakelt naar selectieoptimalisatie. De gebruiker start vervolgens
de berekening. Bestaande toewijzingen buiten de nieuwe selectie worden niet
gewist of gewijzigd. De twee selectie-instellingen blijven van toepassing en
zijn zichtbaar: uitsluiten als besliseenheid betekent niet automatisch dat
een bestaande toewijzing voor whole-plan-limieten of als geldige vaste buur
wordt genegeerd.

Conflicterende of ongeldige locks worden expliciet gediagnosticeerd en nooit
stilzwijgend aangepast. Ontbrekende analyseresultaten of kosten zijn een
voorbereidingsprobleem, geen bewijs dat een unit technisch onoplosbaar is.
Een actie om oplosbare units te selecteren mag zulke ontbrekende gegevens niet
als bewezen lokaal onoplosbaar classificeren.

Na de selectie krijgt iedere deelnemende unit precies een configuratie. Er is
geen solvervariabele voor niet-toewijzen. Units worden niet weggelaten om
globale limieten, budget of wisselingsscore gunstiger te maken. Bij een lege
resterende selectie wordt geen solver gestart.

Het resultaat beschrijft de geoptimaliseerde selectie en maakt duidelijk dat
uitgesloten of bestaande ongeldige toewijzingen niet zijn opgelost.

## 10. Advies bij te strenge variatiemaxima

Als stap 1 bewezen onhaalbaar is door de globale maxima, voer een afzonderlijk
diagnosemodel uit met dezelfde kandidaten, locks en limietscope. Dit model
heeft geen kostenbudget: dat is nog niet bepaald.

Voor iedere ingeschakelde limiet j in {T,S,C} introduceren we een gehele
verruiming Delta_j >= 0 en een binaire indicator r_j. Kies M_j als een geldige
bovengrens voor de benodigde verruiming, afgeleid uit het eindige aantal
beschikbare en vaste labels.

```text
aantal_j <= N_j + Delta_j
r_j <= Delta_j <= M_j*r_j
```

Als M_j nul is, fixeert dat zowel Delta_j als r_j op nul. Uitgeschakelde
limieten krijgen geen verruimingsvariabele.

Minimaliseer lexicografisch:

1. som(j) r_j: zo weinig mogelijk verschillende instellingen wijzigen;
2. som(j) Delta_j: daarbinnen zo weinig mogelijk totale verhoging.

Dit is uitsluitend een doel voor de diagnose, geen extra doel van het
ruimtelijke model. Het is geen bewering dat verschillende soorten limieten
voor de gebruiker even belangrijk zijn; het geeft een eenvoudige voorkeur
voor een beknopt aanpassingsvoorstel.

Een voorstel wordt onderbouwd door een geldige toewijzing. Rapporteer alle
benodigde verhogingen samen. Meerdere alternatieven kunnen bestaan; een
voorgestelde verhoging is niet noodzakelijk de enige oplossing. Zonder bewijs
van minimaliteit heet het een mogelijke aanpassing. Een tijdslimiet zonder
gevonden voorstel rechtvaardigt geen specifieke limietaanbeveling.

Instellingen veranderen alleen wanneer de gebruiker het voorstel toepast.
Daarna wordt de kostenreferentie opnieuw bepaald.

## 11. Resultaten, uitvoering en eigenaarschap

Onderscheid voorbereidingsproblemen, bewezen onhaalbaarheid, tijdslimiet zonder
oplossing, een geldige oplossing zonder optimaliteitsbewijs en bewezen
optimaliteit. Rapporteer waar beschikbaar ondergrens en optimaliteitsafstand
afzonderlijk voor de kostenreferentie en voor de wisselingsscore.

Toon ten minste:

- de selectie en buiten de berekening gebleven units;
- de twee instellingen voor invloed van buiten de selectie;
- de kostenreferentie en of die bewezen optimaal is;
- het budgetpercentage, budgetbedrag en werkelijke kosten binnen de selectie;
- gebruikte aantallen configuraties, puntniveaus en afmetingen in de gekozen
  limietscope;
- alleen-ppn-, alleen-afmeting- en beide-wisselingen en de gewogen score;
- solverstatus en relevante voorbereidingsdiagnoses.

Voor reproduceerbare runs worden invoer en modelopbouw canoniek geordend en de
solverinstellingen vastgelegd. Het model kan meerdere optimale toewijzingen
hebben. Een vaste seed alleen garandeert geen identieke uitkomsten bij
verschillende tijdslimieten, platformen of solverversies. Gelijke modelregels
en onafhankelijke resultaatcontrole zijn vereist voor browser en desktop.

Verantwoordelijkheden volgen AGENTS.md:

- `pile_options/`: technische paalopties en kosten;
- `optimization/`: voorbereiding, ILP-model, diagnose en resultaatvalidatie;
- `tip_level_regions/`: oorspronkelijke topologie en afgeleide unitgraaf;
- WASM en Tauri: dunne runtime-adapters;
- frontend `app/`: asynchrone uitvoering, annulering, invoerversies en toepassen;
- frontend featurefolders: instellingen, selectieacties en resultaatweergave.

Langere browserberekeningen moeten buiten de hoofdthread kunnen draaien.
Projectwijzigingen worden als een consistente wijziging in undo/redo en dirty
state opgenomen. Nieuwe projectinstellingen krijgen compatibele normalisatie
voor oudere IFCPP-bestanden. Tijdelijke voortgang en solverhandles zijn geen
projectinhoud. Nieuwe interfacekopie wordt Nederlands en Engels aangeboden.

## 12. Verificatie bij implementatie

De implementatie wordt getoetst aan kleine exhaustief doorzoekbare problemen
naast realistische projecten. Verifieer ten minste:

1. Kosten k_c worden precies n_u keer meegeteld; externe kosten ontbreken in
   referentie en budget.
2. Groepsleden krijgen dezelfde configuratie en locks blijven behouden.
3. Duplicaatverbindingen tussen units tellen eenmaal; interne groepsedges tellen
   niet en uitsluiten van units creëert geen nieuwe verbindingen.
4. Alle vier wisselingsgevallen leveren exact 0, alpha, beta en gamma op,
   ook bij nulgewichten en gamma < alpha + beta.
5. De vier combinaties van de twee selectie-instellingen werken onafhankelijk.
6. Externe en interne labelverzamelingen worden zonder dubbeltellingen geteld,
   inclusief externe labels die niet als kandidaat beschikbaar zijn.
7. Een lokaal lege unit kan expliciet worden uitgesloten; gezamenlijk
   onhaalbare maxima leiden niet tot het opofferen van units.
8. Ontbrekende kosten of analyses worden niet als lege technische domeinen
   behandeld. Ongeldige vaste buren leveren geen fictieve wisselingsscore.
9. Diagnoseadviezen leveren daadwerkelijk een haalbare toewijzing op, ook als
   twee maxima tegelijk moeten worden verhoogd.
10. Bij p=0 blijft de referentie haalbaar. Het budget wordt niet overschreden;
    relevante invoerwijzigingen verversen de referentie.
11. Voor bewezen optima kan een groter budget de minimale wisselingsscore niet
    verhogen bij verder identieke invoer. Vergelijk dit niet zonder meer met
    resultaten die alleen door een tijdslimiet zijn beëindigd.
12. Tijdslimieten, annulering en verouderde resultaten worden correct verwerkt;
    ongewijzigde externe toewijzingen blijven behouden.

Gebruik daarnaast het voorbeeldproject en gevallen met eilanden, uitlopers,
ongelijke puntdichtheid, groepsverbindingen en vergrendelde buren. Vergelijk
kosten, score, configuratieaantallen, runtime en oplossingskwaliteit. Dit
document claimt geen gemeten solverprestaties of bewezen geometrische
compactheid.

## 13. Plaatsing in de app

Naast de bestaande greedy optimizer komt een ribbon-groep **ILP-optimalisatie**
met de knoppen Uitvoeren en Instellingen. Het zijpaneel bevat dezelfde soorten
instellingen als greedy, aangevuld met de ILP-instellingen. Dit volgt de
expliciete plaatsingscorrectie van de gebruiker tijdens de uitvoering.

### Afzonderlijk onthouden en vergelijken met greedy

Greedy en ILP onthouden hun optimizerinstellingen afzonderlijk. Dit betreft
ook de gemeenschappelijke bediening: alle locaties / selectie,
kandidaatconfiguraties, configuratielimieten en hun scope, benuttingslimiet en
opslaan als nieuw palenplan. Bij eerste ingebruikname van ILP mogen de bestaande
greedy waarden als beginwaarden worden gekopieerd; daarna worden wijzigingen
niet tussen de optimizers gesynchroniseerd. De ILP-specifieke instellingen
horen uitsluitend bij ILP.

Gedeelde projectgegevens, waaronder CPT-selecties, foundation advice,
kosteninstellingen, belastingspuntgroepen, locks en de actuele selectie, blijven
gedeeld. Afzonderlijk onthouden betekent dus geen duplicatie van projectinhoud
of een aparte verzameling geselecteerde locaties per optimizer. Bewaar bij
projectopslag en migratie het onderscheid tussen projectinstellingen en
tijdelijke interface- en uitvoeringsstatus.

De greedy optimizer blijft tijdens ontwikkeling en validatie beschikbaar als
vergelijkingsmogelijkheid. Vergelijk kosten onder dezelfde kandidaat-, groeps-,
lock- en benuttingsvoorwaarden en maak verschillen in volledige toewijzing en
harde configuratielimieten zichtbaar. Vergelijk de greedy kosten in eerste
instantie met de kostenreferentie van ILP; de ruimtelijke tweede stap mag
bewust meer kosten binnen het gekozen budget.

De gewenste vervolgrichting is greedy te verwijderen zodra de nieuwe optimizer
zijn rol voldoende betrouwbaar en bruikbaar overneemt. Die verwijdering is
geen onderdeel van de huidige implementatie. Prestatie- en kwaliteitsmetingen
gaan eraan vooraf; een tijdgelimiteerde ILP-uitkomst is niet automatisch beter
dan een greedy uitkomst. Een toekomstige verwijdering vraagt afzonderlijke
aandacht voor bediening en compatibiliteit van opgeslagen instellingen.

### Plaatsing in de bestaande Plan-ribbon

De gebruiker heeft de plaatsing tijdens de uitvoering verduidelijkt: naast
Greedy-optimalisatie komt een groep **ILP-optimalisatie** met twee knoppen,
**Uitvoeren** en **Instellingen**. Er komt geen extra ribbon-tab.

Instellingen opent het zijpaneel met dezelfde kop, secties, segmented controls,
getalvelden, kleuren en tussenruimte als de bestaande optimizer. Het paneel
bevat bereik, kandidaatconfiguraties, drie configuratielimieten (leeg is
onbeperkt), benuttingslimiet, kostenbudget (standaard 5%), drie wisselingsgewichten
en opslaan als nieuw palenplan. De twee afzonderlijke keuzes voor buiten de
selectie staan alleen bij selectieoptimalisatie in beeld; hun waarden blijven
behouden bij wisselen van bereik. De derde wisselingswaarde is de totale straf
voor beide verschillen, geen toeslag.

Uitvoeren opent hetzelfde paneel en start de run. Voortgang, stoppen, diagnoses,
limietvoorstellen en resultaten worden daarin getoond. De knop **Selecteer
oplosbare belastingspunten** staat boven de diagnoselijst, zodat daarvoor niet
door alle meldingen gescrold hoeft te worden. Technische beslissingen blijven
in Rust; paneelacties passen alleen gecontroleerde resultaten toe.

## 14. Solverkeuze en mogelijke vervolgstappen

Gebruik **good_lp voor de modelopbouw en microlp als eerste solver**, zowel in
de desktopapp als in de browser. HiGHS blijft een mogelijke vervolgstap als
metingen daar aanleiding toe geven.

`good_lp` verzorgt variabelen, lineaire expressies, constraints en de koppeling
met een solver. Schrijf de modelregels eenmalig in de Rust-core en houd de keuze
van de solver gescheiden van die regels. Een eigen algemene modelleringstaal
of extra sparse modelrepresentatie is voor de eerste implementatie niet nodig.

Schakel bij `good_lp` de standaardfeatures uit en uitsluitend de benodigde
`microlp`-feature in. De standaardconfiguratie gebruikt anders CBC. Selecteer
de backend expliciet; een later toegevoegde Cargo-feature mag niet ongemerkt
de gekozen solver veranderen. Leg de geteste versies vast bij implementatie.

De verantwoordelijkheden zijn:

1. De Rust-core bereidt de units voor en bouwt het ILP met `good_lp`.
2. `good_lp` geeft het model door aan microlp. Dezelfde Rust-route wordt native
   en als WASM uitgevoerd. De browserberekening draait in een Web Worker;
   native uitvoering gebeurt in een achtergrondtaak.
3. Een kleine eigen uitvoeringslaag verzorgt de twee optimalisatiefasen,
   referentiebeheer, tijdslimieten en de vertaling naar app-resultaten.
4. De Rust-core controleert een gevonden toewijzing opnieuw op kandidaten,
   locks, groepsgelijkheid, kostenbudget en variatiemaxima en berekent de score
   opnieuw uit de toewijzing voordat het resultaat wordt toegepast.

Controleer in de daadwerkelijk gebruikte versies welke solverfuncties de
`good_lp`-adapter doorgeeft. Tijdslimieten, startoplossingen en gap-instellingen
zijn relevante eigenschappen; exacte stopredenen, bereikte ondergrenzen/gaps,
hervatten, voortgang en annulering kunnen aanvullende toegang tot de
onderliggende solver vereisen. Een ingestelde gap-tolerantie is niet hetzelfde
als de gemeten gap van een resultaat. Verlies door de algemene API nooit het
onderscheid tussen een bewezen onhaalbaar model en een tijdslimiet zonder
gevonden oplossing.

Microlp is volledig in Rust geschreven en ondersteunt gehele en binaire
variabelen via branch-and-bound. De actuele documentatie noemt tijdslimieten,
MIP gap, warm starts en hervatten. Dit maakt het een geschikte eerste kandidaat;
het is geen prestatiegarantie voor dit specifieke model.

### Metingen en eventuele overstap naar HiGHS

Meet eerst in release-builds op het voorbeeldproject en moeilijkere voorbeelden:
tijd tot een eerste geldige oplossing, oplossingskwaliteit na een vaste
rekentijd, beschikbare optimaliteitsafstand en tijd tot bewezen optimaliteit.
Meet zowel native als in de browser, en varieer kostenbudgetten en
configuratielimieten. Leg geen standaardrekentijd of prestatiebelofte vast
zonder deze metingen. Gebruik een bestaande greedy oplossing uitsluitend als
startoplossing wanneer die aan alle harde voorwaarden voldoet; de
kostenreferentie kan als startoplossing voor de ruimtelijke fase dienen.

Als microlp onvoldoende presteert, kan native HiGHS via de bestaande `good_lp`
backend worden onderzocht met behoud van de modelregels. HiGHS gebruikt
branch-and-cut. Backendopties, statussen, builds en voortgang vragen bij een
overstap nog wel aandacht; `good_lp` maakt die aspecten niet volledig identiek.

Een overstap mag beperkt blijven tot de desktopversie. De browser mag microlp
blijven gebruiken en daardoor langzamer rekenen. Browser en desktop blijven
hetzelfde wiskundige model en dezelfde technische regels gebruiken, maar hoeven
niet dezelfde solver, rekensnelheid of bij een tijdslimiet dezelfde
oplossingskwaliteit te hebben. Rapporteer de feitelijk bereikte solverstatus en
kwaliteit per run; een verschil in solver rechtvaardigt geen zwakkere
geldigheidscontrole.

De native `highs`-backend van `good_lp` is geen kant-en-klare browserkoppeling.
HiGHS in de browser blijft een afzonderlijke integratie, bijvoorbeeld via
`highs-js` in een Worker, waarvoor modeloverdracht of een aanvullende backend
nodig is. De beschikbaarheid van twee native backendfeatures maakt die
overstap niet automatisch. Engineeringregels en resultaatcontrole blijven ook
dan in Rust. HiGHS-JS is een optionele vervolgstap wanneer de browser met
microlp daadwerkelijk te traag blijkt; een native overstap verplicht niet tot
deze browserintegratie.

Bronnen voor de solververkenning, geraadpleegd op 18 september 2026:

- [HiGHS: oplossingsmethoden](https://ergo-code.github.io/HiGHS/dev/solvers/)
- [Rust-crate highs](https://docs.rs/highs/latest/highs/)
- [highs: Model API](https://docs.rs/highs/latest/highs/struct.Model.html)
- [HiGHS-JS: WASM, sparse modellen en Workers](https://github.com/lovasoa/highs-js/blob/main/README.md)
- [good_lp: ondersteunde solvers en WASM](https://github.com/rust-or/good_lp)
- [good_lp: microlp-backend](https://docs.rs/good_lp/latest/good_lp/solvers/microlp/struct.MicroLpProblem.html)
- [microlp: mogelijkheden en solveruitkomsten](https://docs.rs/microlp/latest/microlp/)


## Aanvulling: native HiGHS en expliciete lokale route

De eerdere keuze voor microlp op beide platforms is vervangen door HiGHS op
desktop en microlp in de browser. Het good_lp-model en de validatie blijven
gedeeld. De afzonderlijke actie **Lokaal verbeteren** voert de kostenreferentie
en lokale verbetering uit zonder de ruimtelijke MILP. De gewone ILP-actie krijgt
een limiet van tien minuten en rapporteert de beste gevalideerde score,
ondergrens en relatieve afstand tot die ondergrens.

**Stoppen en beste plan gebruiken** bewaart het beste gevalideerde plan dat de
interface heeft ontvangen. **Annuleren** verwerpt de berekening. Een wijziging
in project of selectie blijft resultaten ongeldig maken. Tussentijdse plannen
worden alleen bij een betere score overgedragen. De tekening blijft tijdens
het zoeken staan; een live tekening is op verzoek uitgesteld.
