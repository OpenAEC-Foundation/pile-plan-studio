from Classes import Configuratie
from numpy import inf

def controleer_opties(opties, app):
    ppns = set([c.ppn for c in Configuratie.gekozen])
    if len(ppns) >= app.parameters.max_ppns:
        opties = [c for c in opties if c.ppn in ppns]
        
    afmetingen = set([c.afmeting for c in Configuratie.gekozen])
    if len(afmetingen) >= app.parameters.max_afmetingen:
        opties = [c for c in opties if c.afmeting in afmetingen]
    
    return opties
        
def eerste_laag(individueel_palenplan, app):
    
    palenplan = individueel_palenplan
    gekozen_palenplan = [b.huidige_paal for b in \
                               individueel_palenplan.belastinglocaties]
    
    #Bepaal de fitness functie voor elke configuratie
    minst_afwijkend = inf
    laagste_kosten = inf
    laagste_kosten_afwijkend = inf
    while minst_afwijkend > 0 and Configuratie.opties:
        
        for configuratie in Configuratie.opties:
            #Reset palenplan
            for b in palenplan.belastinglocaties:
                b.huidige_paal = gekozen_palenplan[palenplan.belastinglocaties.index(b)]
                    
            aantal_afwijkend = pas_configuratie_toe(palenplan, 
                         Configuratie.gekozen + [configuratie], app)
            
            #Als geen afwijkende belastinglocaties mogelijk is, kies degene
            #met de hoogste fitness
            if aantal_afwijkend == 0:
                minst_afwijkend = 0
                kosten = palenplan.kosten_totaal()
                if kosten < laagste_kosten:
                    laagste_kosten = kosten
                    beste_palenplan = palenplan
                    beste_configuratie = configuratie
                
            else:
                #Minimalisering op aantal afwijkende belastinglocaties
                if aantal_afwijkend < minst_afwijkend:
                    minst_afwijkend = aantal_afwijkend
                    beste_palenplan = palenplan
                    beste_configuratie = configuratie
                    
                #Bij gelijk aantal afwijkende: maximalisering fitness
                kosten = palenplan.kosten_totaal()
                if aantal_afwijkend == minst_afwijkend and \
                    kosten < laagste_kosten_afwijkend:
                    laagste_kosten_afwijkend = kosten
                    minst_afwijkend = aantal_afwijkend
                    beste_palenplan = palenplan
                    beste_configuratie = configuratie
                    
        gekozen_palenplan = [b.huidige_paal for b in beste_palenplan.belastinglocaties]
            
        for b in palenplan.belastinglocaties:
                b.huidige_paal = gekozen_palenplan[palenplan.belastinglocaties.index(b)]
                
        Configuratie.gekozen.append(beste_configuratie)
        Configuratie.opties = controleer_opties([c for c in Configuratie.opties\
                         if c not in Configuratie.gekozen], app)
        app.palenplan = palenplan
        app.replot()
        
    
    return palenplan

#Pas deze configuratie toe
def pas_configuratie_toe(palenplan, configuraties, app):  
    
    aantal_afwijkend = 0
   
    for b in palenplan.belastinglocaties:
        
        doorsnede = [p for p in b.palen if p in configuraties]
        
        if doorsnede:
            b.huidige_paal = doorsnede[0]
            
        else:
            aantal_afwijkend += 1
    
    return aantal_afwijkend


            
