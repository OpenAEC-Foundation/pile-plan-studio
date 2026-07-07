from Paalkosten import paalkosten
import math
import re
    
class Configuratie:
    
    opties = []
    mogelijk = []
    gekozen = []
    uitgesloten = []
    
    def __init__(self, ppn, afmeting):
        self.ppn: float = float(ppn)
        self.afmeting: int = int(afmeting)
        self.optie = True

    def __str__(self):
        return " ".join([str(self.afmeting), str(self.ppn)])

    def __eq__(self, other):
        return self.ppn == other.ppn and self.afmeting == other.afmeting
    
    def vind_frd(self, sondering):
        if sondering is None:
            return ""
        
        for meting in sondering.sonderingsmetingen:
            if meting.configuratie.ppn == self.ppn and \
                 meting.configuratie.afmeting == self.afmeting:
                return abs(meting.frd)
        return 0
    
    
class Paal(Configuratie):

    def __init__(self, aantal, ppn, afmeting, benuttingsgraad, 
                 kosten=None, frd_sondering=None):
        self.aantal = int(aantal)
        if ppn == '' or afmeting == '':
            self.empty_string_init(ppn, afmeting, kosten)
        else:
            self.configuratie = Configuratie(ppn, afmeting)
            self.ppn = float(ppn)
            self.afmeting = int(afmeting)
            self.kosten = self.get_kosten()
        self.benuttingsgraad = float(benuttingsgraad)
        self.frd_sondering = frd_sondering
        
    def empty_string_init(self, ppn, afmeting, kosten):
        #voor selecteren op alleen ppn/afmeting in paalvenster
        self.configuratie = None
        self.kosten = kosten
        if ppn == '':
            self.ppn = ''
            self.afmeting = int(afmeting)
        else:
            self.afmeting = ''
            self.ppn = float(ppn)
        

    def __str__(self):
        if self.frd_sondering is not None:
            frd = str(self.configuratie.vind_frd(self.frd_sondering))
            frd_graad = " ".join([str(frd), str(int(round(100*self.benuttingsgraad, 0))) + "%"])
        else:
            frd_graad = " ".join(["??", str(int(round(100*self.benuttingsgraad, 0))) + "%"])
            
        return " ".join([str(self.aantal) + "x", str(self.afmeting), str(self.ppn), 
                         "€"+re.sub(r'(?<!^)(?=(\d{3})+$)', r'.', str(self.kosten)), 
                          frd_graad])

    def __eq__(self, other):
        return self.ppn == other.ppn and self.afmeting == other.afmeting
    
    def __hash__(self):
        return hash((self.ppn, self.afmeting))
    
    def get_kosten(self):
        return paalkosten(self.configuratie, self.aantal)
    
        

class Coordinaten:

    def __init__(self, x, y):
        self.x = round(float(x), 0)
        self.y = round(float(y), 0)
    
    def get_coordinaten(self):
        return (self.x,self.y)
    
    def __str__(self):
        return " ".join([str(self.x), str(self.y)])
    
    def __add__(self,other):
        return Coordinaten(self.x+other.x, self.y+other.y)
    
    def __sub__(self,other):
        return Coordinaten(self.x-other.x, self.y-other.y)
    
    def __neg__(self):
        return Coordinaten(-self.x, -self.y)
    
    def __mul__(self,other):
        return self.x*other.x + self.y*other.y
    
    def __abs__(self):
        return math.sqrt((self.x**2 + self.y**2))
                         
    def afstand(self, other):
        return math.sqrt((self.x-other.x)**2 + (self.y-other.y)**2)
    
    def det(self, other):
        return self.x*other.y - self.y*other.x
    
    def hoek(self,other1, other2):
        self_other1 = other1 - self
        self_other2 = other2 - self
        return 180-math.degrees(math.atan2(-self_other1.det(self_other2), 
                                           -self_other1*self_other2))

class Belastinglocatie(Coordinaten):
    
    def __init__(self, knoopnummer, x, y, fed):
        self.naam = "Knoop " + str(knoopnummer)
        self.x = int(x)
        self.y= int(y)
        self.coordinaten = Coordinaten(self.x, self.y)
       
        self.fed = float(fed)
        self.sonderingen = []
        self.te_grote_hoeken = []
        self.palen = []
        self.geen_opties = []
        self.locked = False
        
        #Plot attributes
        self.plot = None
        self.aantal_text = None
        self.marker = None
        self.marked_red = False
        self.red_marker = None
        
    def voeg_paal_toe(self, paal):
        self.palen.append(paal)
        self.palen.sort(key=lambda x: x.kosten)
        self.huidige_paal: Paal = self.palen[0]
        
    def __str__(self):
        string = "\n".join([self.naam, str(self.huidige_paal), ""])
        return string
    
    def create_plot(self, main):
        ppn, afmeting = self.huidige_paal.ppn, self.huidige_paal.afmeting
        if not main.legend_switched:
            kleur = main.afmetingskleuren[afmeting]
            vorm = main.vormen[min(main.ppns.index(ppn), 
                               len(main.vormen)-1)]
        if main.legend_switched:
            kleur = main.ppn_cmap(main.ppns.index(ppn) / (len(main.ppns)-1))
            vorm = main.vormen[min(main.afmetingen.index(afmeting), 
                               len(main.vormen)-1)]
        
        kleur2 = main.colormap(self.huidige_paal.benuttingsgraad)
            
        fillstyle = ['full', 'top', 'full'][int(main.kleurgraad)]
        self.plot = main.ax.plot(self.x, self.y, marker=vorm, color=kleur, 
                                 ms=5*main.size, mew=0.4*main.size, mec='none', 
                                 fillstyle=fillstyle, mfcalt = kleur2, clip_on=False)[0]
        if main.kleurgraad == 2:
            self.swap_colors()
        
        self.create_fed_text(main)
        self.fed_text.set_visible(main.fed_text)
        self.create_graad_text(main)
        self.graad_text.set_visible(main.graad_text)
        
        self.mark(main)
        self.marker.set_visible(False)
        self.mark_red(main)
        self.red_marker.set_visible(self.marked_red)
        self.plot.set_picker(True)
        self.plot.set_pickradius(1.5)
        self.plot.obj = self
    
    def swap_colors(self):
        kleur = self.plot.get_color()
        kleur2 = self.plot.get_mfcalt()
        self.plot.set_color(kleur2)
        self.plot.set_mfcalt(kleur)
    
    def create_aantal_text(self, main):
        self.aantal_text = main.ax.text(self.x, self.y, 
                                self.huidige_paal.aantal, 
                                ha = "center", 
                                va = "center", 
                                color='white',
                                fontsize=2*main.size,
                                clip_on = True)
        self.aantal_text.set_visible(self.huidige_paal.aantal>1)
    
    def create_fed_text(self, main):
        text = int(self.fed)
        offset = (main.text_distance, main.text_distance)
        self.fed_text = main.ax.annotate(text,
                                       (self.x, self.y),
                                       xytext = offset,
                                       textcoords = 'offset points',
                                       color='black',
                                       fontsize=3*main.size,
                                       ha = 'left',
                                       va = 'bottom',
                                       annotation_clip = True) 
        
    def create_graad_text(self, main):
        text = str(int(self.huidige_paal.benuttingsgraad*100))+"%"
        offset = (main.text_distance, -main.text_distance)
        self.graad_text = main.ax.annotate(text,
                                       (self.x, self.y),
                                       xytext = offset,
                                       textcoords = 'offset points',
                                       color='black',
                                       fontsize = 3*main.size,
                                       ha = 'left',
                                       va = 'top',
                                       annotation_clip = True)  

    def mark(self, main):
        self.marker, = main.ax.plot(self.x, self.y, 
                        marker='o',
                        ms=6*main.size, fillstyle='none',
                        mec='gray', mew=0.8*main.size)
        main.ax.draw_artist(self.marker)
    
    def mark_red(self, main):
        self.red_marker, = main.ax.plot(self.x, self.y, 
                        marker='o',
                        ms=8*main.size, fillstyle='none',
                        mec='red', mew=0.8*main.size)
        main.ax.draw_artist(self.red_marker)
    
    def reset(self, main):
        self.sonderingen = []
        self.te_grote_hoeken = []
        self.palen = []
        self.geen_opties = []
        self.marked_red = False
        if self.red_marker:
            self.red_marker.set_visible(False)
        

class Sondering(Coordinaten):
    
    instances = []
    
    def __init__(self, nummer, x, y):
        self.instances.append(self)
        self.nummer: int = int(nummer)
        self.x = int(x)
        self.y = int(y)
        self.coordinaten = Coordinaten(self.x,self.y)
        self.sonderingsmetingen: list = []
        
        #Plot attributes
        self.plot = None
        self.nummer_text = None
    
    def __eq__(self, other):
        return self.nummer == other.nummer
    
    def __hash__(self):
        return hash(self.nummer)

class Sonderingsmeting:

    def __init__(self, ppn, afmeting, frd):
        self.configuratie = Configuratie(ppn, afmeting)
        self.ppn: float = float(ppn)
        self.afmeting: int = afmeting
        self.frd: int = int(frd)
    
    def __str__(self):
        return " ".join([str(self.afmeting), str(self.ppn), str(self.frd)])
    
    def __eq__(self, other):
        return self.ppn == other.ppn and self.afmeting == other.afmeting
    
class Palenplan:
    
    def __init__(self, belastinglocaties):
           self.belastinglocaties = [b for b in belastinglocaties if b.palen
                               and not b.locked]
           self.geen_opties = [b for b in belastinglocaties if not b.palen
                         and not b.locked]
           self.locked = [b for b in belastinglocaties if b.locked]
   
    def kosten_totaal(self):
        return sum([b.huidige_paal.kosten for b in self.belastinglocaties +
              self.locked])
    
    def kosten_totaal_str(self):
        return "Kosten: €" +  re.sub(r'(?<!^)(?=(\d{3})+$)', r'.', 
              str(self.kosten_totaal()))
    
    def benuttingsgraad_totaal(self):
        benuttingsgraden = [b.huidige_paal.benuttingsgraad for b in \
                      self.belastinglocaties + self.locked]
        if benuttingsgraden:
            return int(round(100*sum(benuttingsgraden)/len(benuttingsgraden),0))
        else:
            return 0
    
    def benuttingsgraad_totaal_str(self):
        return "Benuttingsgraad: " + \
            str(self.benuttingsgraad_totaal()) + "%"
    
    def alle_belastinglocaties(self, geen_opties = True):
        alle = self.belastinglocaties + self.locked
        if geen_opties:
            alle += self.geen_opties
        return alle
    
    def print(self):

       for belastinglocatie in self.belastinglocaties:
           print(belastinglocatie.naam + ": " + str(belastinglocatie.huidige_paal))
       print("\n")
       print(self.kosten_totaal_str())
       print("\n")
       print("\n")    
       print(self.benuttingsgraad_totaal_str())
   
       
class Parameters:
    
    def __init__(self, max_ppns, max_afmetingen, max_aantal, max_graad):
        self.max_ppns = int(max_ppns)
        self.max_afmetingen = int(max_afmetingen)
        self.max_aantal = int(max_aantal)
        self.max_graad = float(max_graad)
        
        
    
        
