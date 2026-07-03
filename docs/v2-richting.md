# V2-richting

De volgende versie van Palenplan moet in eerste instantie een betrouwbare
rekentool zijn voor paalopties per belastinglocatie. De kern is niet dat het
programma automatisch een optimaal palenplan maakt, maar dat het voor een
gegeven belastinglocatie, sonderingselectie en set draagvermogens een correcte
lijst met mogelijke paalopties oplevert.

## Harde kern

- Voor elke belastinglocatie moet duidelijk zijn welke sonderingen meegenomen
  worden.
- Voor elke geselecteerde sondering moeten de beschikbare draagvermogens aan de
  juiste paalconfiguraties gekoppeld worden.
- Een paaloptie is alleen geldig als alle geselecteerde sonderingen voor die
  configuratie voldoende draagvermogen hebben.
- De maatgevende sondering is de geselecteerde sondering met de laagste totale
  draagkracht voor de gekozen configuratie en het gekozen aantal palen.
- De benuttingsgraad volgt uit de belasting gedeeld door de maatgevende totale
  draagkracht.

## Bewust niet vastgezet

De huidige automatische optimalisatie en het iteratieve heuristische algoritme
zijn legacy/referentie, maar geen normatieve kern voor v2. In de praktijk wordt
het palenplan nog grotendeels met de hand beoordeeld en samengesteld. V2 mag
daarom eerst handmatig kiezen, controleren en vergelijken ondersteunen.

De huidige sonderingselectie is waardevol, maar niet perfect en lastig als
objectief model vast te leggen. V2 moet ruimte laten voor flexibelere selectie:
automatische voorstellen, handmatige correctie en later mogelijk meerdere
selectiestrategieen.

## Latere uitbreidingen

Optimalisatie kan later als aparte module worden toegevoegd. Mogelijke richtingen
zijn bijvoorbeeld randomized iteration, simulated annealing of een linear
programming aanpak. Die optimalisatie moet bovenop de geteste paaloptie-kern
werken, niet verweven raken met het bepalen of een individuele paaloptie
constructief geldig is.

## UI-richting

V2 moet de gebruiker ondersteunen bij het handmatig samenstellen en controleren
van een palenplan. De interface moet daarom niet alleen een eindresultaat tonen,
maar vooral inzicht geven in de beschikbare paalopties per belastinglocatie.

Belangrijke UI-doelen:

- Per belastinglocatie moet direct zichtbaar zijn welke paalopties beschikbaar
  zijn en waarom opties wel of niet geldig zijn.
- De geselecteerde sonderingen moeten zichtbaar en handmatig aanpasbaar zijn.
- De maatgevende sondering en benuttingsgraad moeten per paaloptie inzichtelijk
  zijn.
- De gebruiker moet paalopties kunnen vergelijken op draagkracht,
  benuttingsgraad, kosten en uitvoerbaarheid.
- Automatische optimalisatie mag later suggesties geven, maar mag niet de enige
  manier zijn om tot een palenplan te komen.

Een belangrijk ontwerpdoel is daarnaast uniformiteit in het palenplan. In de
praktijk is het onwenselijk om veel verschillende paalsoorten te gebruiken.
Daarbij gaat het zowel om het totaal aantal verschillende combinaties van
paallengte en afmeting, als om de mate waarin palen die dicht bij elkaar liggen
van elkaar verschillen. Het is wenselijk om gebieden te kunnen vormen waarbinnen
dezelfde soort paal wordt toegepast.

Omdat dit lastig objectief te modelleren en optimaliseren is, hoeft v2 dit in
eerste instantie niet automatisch op te lossen. De UI moet dit proces wel goed
ondersteunen. Gebruikers moeten meerdere belastinglocaties kunnen selecteren,
de gemeenschappelijke paalopties van die selectie kunnen zien, en vervolgens een
keuze groepsgewijs kunnen toepassen. De UI is daarmee primair een interactieve
ontwerp- en controleomgeving, geen black-box optimalisatieknop.
