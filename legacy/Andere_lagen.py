from Classes import Configuratie
import Eerste_laag as el

def optimaliseer_palenplan(individueel_palenplan, app):
    eerste_laag = el.eerste_laag(individueel_palenplan, app)
    return andere_lagen(eerste_laag, app)        

def vind_gebruikte_configuraties(palenplan):
    configuraties = list()
    for b in palenplan.belastinglocaties:
        if b.huidige_paal.configuratie not in configuraties:
            configuraties.append(b.huidige_paal.configuratie)
    return configuraties
    
def andere_lagen(palenplan, app):
    
    while Configuratie.opties:

        laagste_kosten = palenplan.kosten_totaal() 
        begin_palenplan = [b.huidige_paal for b in palenplan.belastinglocaties]
        beste_configuratie = Configuratie(0,0)
        
        for configuratie in Configuratie.opties: 
                
            pas_configuratie_toe(palenplan, configuratie, begin_palenplan)
            kosten = palenplan.kosten_totaal()
            if kosten < laagste_kosten:
                laagste_kosten = kosten
                beste_configuratie = configuratie
        
        if beste_configuratie != Configuratie(0,0):
            Configuratie.opties.remove(beste_configuratie)
            Configuratie.gekozen.append(beste_configuratie)
            palenplan = pas_configuratie_toe(palenplan, beste_configuratie,
                                             begin_palenplan)
        
        else:
            for b in palenplan.belastinglocaties:
                b.huidige_paal = begin_palenplan[palenplan.belastinglocaties.index(b)]
            break
        
        gebruikte_configuraties = vind_gebruikte_configuraties(palenplan)
        Configuratie.opties = el.controleer_opties([c for c in Configuratie.opties\
                         if c not in gebruikte_configuraties], app)
        app.palenplan = palenplan
        app.replot()
    return palenplan


def pas_configuratie_toe(palenplan, configuratie, begin_palenplan):
    
    for b in palenplan.belastinglocaties:
        b.huidige_paal = begin_palenplan[palenplan.belastinglocaties.index(b)]
        if b.huidige_paal != configuratie and configuratie in b.palen:
            paal_nieuw = b.palen[b.palen.index(configuratie)]
            kostenverandering = paal_nieuw.kosten - b.huidige_paal.kosten
            if kostenverandering < 0:
                b.huidige_paal = paal_nieuw
    return palenplan