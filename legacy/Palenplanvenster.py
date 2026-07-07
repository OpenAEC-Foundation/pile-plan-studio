from Classes import Configuratie, Parameters, Sondering, Coordinaten
from Palenvenster import palenvenster, afmetingskleuren, vormen
from Paalkosten import rond
from Sonderingsvenster import sonderingsvenster
import Palenplanroutine

import tkinter as tk
import numpy as np
import pandas as pd
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.figure import Figure
import matplotlib.patches as mpatches
from matplotlib.widgets import LassoSelector
from matplotlib.path import Path
from matplotlib.backend_bases import key_press_handler
from matplotlib import colormaps
from Colormap import cmap_map
from Projectmap import project_path, vraag_projectmap
import os
from time import time


class Window(tk.Frame):
    
    def __init__(self, master):
        
        self.master = master
        tk.Frame.__init__(self, master)
        self.master.protocol("WM_DELETE_WINDOW", self.onclose)
        self.init_window()
        self.init_figure()
        self.manager = BusyManager(self.master)
        
        self.afmetingskleuren = afmetingskleuren
        self.vormen = vormen
        self.parameters = Parameters(1, 1, 1, 1)
        self.size = 0.5
        self.palenplan = None
        self.selected = []
        self.artists = []
        self.legend_artists = []
        self.history = []
        Palenplanroutine.palenplanroutine(self)
        self.init_controls()
    
    def onclose(self):
        if not self.locked:
            messagebox = tk.messagebox.askquestion('Opslaan?', 
            'Niet alle belastinglocaties zijn vergrendeld. Weet u zeker dat u wilt afsluiten?', 
            icon='warning')
            if messagebox == 'no':
                return True
        if self.app:
            self.app.master.destroy()
        if self.sonderingsvenster:
            self.sonderingsvenster.master.destroy()
        self.master.destroy()
    
    #Window settings
    def init_window(self):
        self.master.title("Palenplan")
        self.master.state('zoomed')
        self.master.attributes("-fullscreen", False)
        self.fullscreen = False
        self.master.bind("<F11>", self.toggle_fullscreen)
        self.master.bind("<Escape>", self.end_fullscreen)
        self.master.bind("<Control-a>", self.select_all)
    
    def toggle_fullscreen(self, event=None):
        self.fullscreen = not self.fullscreen
        self.master.attributes("-fullscreen", self.fullscreen)

    def end_fullscreen(self, event=None):
        self.fullscreen = False
        self.master.attributes("-fullscreen", False)
            
    #Control panel
    def init_controls(self):
        x = 0
        palenplanknop = tk.Button(self.plotFrame, text="Nieuw palenplan", 
            command=self.nieuw_palenplan)
        palenplanknop.place(x=x, y=0)
        self.master.bind("<F5>", self.nieuw_palenplan)
        x += 150
        
        aantal_mogelijke_ppns = len(set([c.ppn for c in Configuratie.mogelijk]))
        max_ppns_scale = tk.Scale(self.plotFrame, orient=tk.HORIZONTAL, 
                            label='Paalpuntniveaus', length = 140,
                            from_=1, to=aantal_mogelijke_ppns, 
                            command=self.set_max_ppns)
        max_ppns_scale.place(x=x, y=0)
        x += 140
        
        aantal_mogelijke_afmetingen = len(set([c.afmeting for c in Configuratie.mogelijk]))
        max_ppns_scale = tk.Scale(self.plotFrame, orient=tk.HORIZONTAL, 
                            label='Afmetingen', length = 140,
                            from_=1, to=aantal_mogelijke_afmetingen, 
                            command=self.set_max_afmetingen)
        max_ppns_scale.place(x=x, y=0)
        x += 140
        
        max_aantal_scale = tk.Scale(self.plotFrame,
                                    from_=1, to=10, 
                                    orient=tk.HORIZONTAL, length=110,
                                    label='Aantal palen',
                                    command=self.set_max_aantal)
        max_aantal_scale.set(self.parameters.max_aantal)
        max_aantal_scale.place(x=x, y=0)
        x += 110
        
        graadscale = tk.Scale(self.plotFrame, 
                       from_=80, to=120, resolution=1,
                       orient=tk.HORIZONTAL, length=140,
                       label='Maximale graad', 
                       command=self.set_max_graad)
        graadscale.set(self.parameters.max_graad*100)
        graadscale.place(x=x, y=0)
        x += 140
        
        sizescale = tk.Scale(self.plotFrame, 
                       from_=0, to=1, resolution=0.1,
                       orient=tk.HORIZONTAL, length=140,
                       label='Icoongrootte', 
                       command=self.set_size)
        sizescale.set(self.size)
        sizescale.place(x=x, y=0)
        x += 140
        
        self.locked = len(self.palenplan.belastinglocaties) == 0
        text = ['\N{LOCK}', '\N{KEY}'][int(self.locked)]
        self.locktoggle = tk.Button(self.plotFrame, text=text, 
                                  command=self.toggle_lock,
                                  font=('Helvetica', '20'))
        self.locktoggle.place(x=x, y=0)
        x += 80
        
        text = '\N{BLACK CIRCLE}'
        self.graadtoggle = tk.Button(self.plotFrame, text=text,
                               command=self.toggle_graad,
                               font=('Helvetica', '20'))
        self.graadtoggle.place(x=x, y=0)
        x += 60
        
        text = '\N{CIRCLED DIGIT ONE}'
        self.sonderingstoggle = tk.Button(self.plotFrame, text=text, 
                                command=self.toggle_sondering,
                                font=('Helvetica', 20))
        self.sonderingstoggle.place(x=x, y=0)
        x += 80
        
        
        text = '\N{LEFT RIGHT ARROW}'
        self.switchlegendtoggle = tk.Button(self.plotFrame, text=text,
                                command = self.switch_legend,
                                font = ('Helvetica', 20))
        self.switchlegendtoggle.place(x=x, y=0)
        x += 80
        
        text = 'FED'
        self.fed_texttoggle = tk.Button(self.plotFrame, text=text,
                                command = self.toggle_fed_text,
                                font = ('Helvetica', 11))
        self.fed_texttoggle.place(x=x, y=0)
        
        text = 'Graad'
        self.graad_texttoggle = tk.Button(self.plotFrame, text=text,
                                command = self.toggle_graad_text,
                                font = ('Helvetica', 9))
        self.graad_texttoggle.place(x=x, y=45)
        x += 70
        
        self.undo_x = x
        self.undo_visible = False

        x += 70

        y = 0

        text = os.path.basename(os.getcwd()) # folder name
        self.project_name_label = tk.Label(self.plotFrame, text=text, font = ('Helvetica', 13))
        self.project_name_label.place(x=x, y=y)
        y += 30 

        text = self.palenplan.benuttingsgraad_totaal_str()
        self.benuttingsgraad_label = tk.Label(self.plotFrame, text=text, font = ('Helvetica', 10))
        self.benuttingsgraad_label.place(x=x, y=y)
        y += 30 

        text = self.palenplan.kosten_totaal_str()
        self.kosten_label = tk.Label(self.plotFrame, text=text, font = ('Helvetica', 10))
        self.kosten_label.place(x=x, y=y)
        y += 30 



    def show_undo(self):
        text = '\N{ANTICLOCKWISE GAPPED CIRCLE ARROW}'
        self.undobutton = tk.Button(self.plotFrame, text=text,
                               command=self.undo,
                               font=('Helvetica', '20'))
        self.undobutton.place(x=self.undo_x, y=0)
        self.undo_visible = True
        
    
    def undo(self):
        alle_belastinglocaties = self.palenplan.belastinglocaties + \
                                    self.palenplan.locked
        alle_belastinglocaties.sort(key=lambda x: x.naam)
        self.history.pop()
        palen, locked, marked = self.history[-1]
        self.unlock(alle_belastinglocaties)
        for b, paal in zip(alle_belastinglocaties, palen):
            self.verander_paal(b, paal)
        self.lock(locked)
        for b in alle_belastinglocaties:
            if b.marker: 
                b.marker.set_visible(b in marked)

        if len(self.history) <= 1:
            self.undo_visible = False
            self.undobutton.place_forget()
        
        self.update_plot()
        self.canvas.draw()
        
    def save_current(self):
        alle_belastinglocaties = self.palenplan.alle_belastinglocaties(geen_opties=False)
        alle_belastinglocaties.sort(key=lambda x: x.naam)
        palen = [b.huidige_paal for b in alle_belastinglocaties]
        locked = self.palenplan.locked
        marked = [b for b in alle_belastinglocaties if b.marked_red]
        self.history.append([palen, locked, marked])
        if len(self.history) > 1:
            self.show_undo()
        
    def nieuw_palenplan(self, event=None):
        Configuratie.mogelijk = []
        Configuratie.opties = []
        Configuratie.gekozen = []
        Configuratie.uitgesloten = []
        for b in self.palenplan.alle_belastinglocaties():
                b.reset(self)
        Palenplanroutine.palenplanroutine(self)
        self.save_current()
        self.canvas.draw()
    
    def set_max_ppns(self, value):
        self.parameters.max_ppns = int(value)
    
    def set_max_afmetingen(self, value):
        self.parameters.max_afmetingen = int(value)
    
    def set_max_aantal(self, value):
        self.parameters.max_aantal = int(value)
    
    def set_max_graad(self, value):
        self.parameters.max_graad = float(value)/100
        
    def set_sonderingsafstand(self, value):
        self.parameters.sonderingsafstand = int(1000*value)

    def set_size(self, value):
        if value != self.size:
            self.replot()
        self.size = float(value)
    
    def toggle_lock(self):
        self.locked = not self.locked
        if self.locked:
            self.locktoggle.config(text='\N{KEY}')
            self.lock(self.palenplan.belastinglocaties)
        else:
            self.locktoggle.config(text='\N{LOCK}')
            self.unlock(self.palenplan.locked)
        self.save_current()
        self.canvas.draw()
        
    def lock(self, belastinglocaties):
        if not [b for b in belastinglocaties if not b.locked]:
            return None
        locked = list(np.array(pd.read_excel(project_path("Vergrendeld.xlsx"), 
                                sheet_name="Vergrendeld", header=None)))
        
        for b in belastinglocaties:
            if not b.locked and b.palen:
                b.locked = True
                
                paal = b.huidige_paal
                locked.append([b.naam, paal.aantal, paal.ppn, 
                                       paal.afmeting, paal.benuttingsgraad,
                                       b.coordinaten.x, b.coordinaten.y])
                b.plot.set_markeredgecolor('black')
                
        self.update_palenplan_lock()
            
        dataframe = pd.DataFrame(np.array(locked))
        dataframe.to_excel(project_path("Vergrendeld.xlsx"), sheet_name='Vergrendeld', 
                     index=False, header=False)
        
    def unlock(self, belastinglocaties):
        if not [b for b in belastinglocaties if b.locked]:
            return None
        locked = list(np.array(pd.read_excel(project_path("Vergrendeld.xlsx"), 
                                sheet_name="Vergrendeld", header=None)))
        
        for b in belastinglocaties:
            if b.locked:
                b.locked = False
                
                b.plot.set_markeredgecolor('none')

                for i in range(len(locked)):
                    if locked[i][0] == b.naam:
                        locked.pop(i)
                        break
                else:
                    continue    
                
        self.update_palenplan_lock()
    
        dataframe = pd.DataFrame(locked)
        dataframe.to_excel(project_path("Vergrendeld.xlsx"), sheet_name='Vergrendeld', 
                     index=False, header=False)
    
    def toggle_graad(self):
        self.kleurgraad = (self.kleurgraad + 1) % 3
        if self.kleurgraad == 0:
            self.graadtoggle.config(text='\N{BLACK CIRCLE}')
            for b in self.palenplan.belastinglocaties + self.palenplan.locked:
                b.plot.set_fillstyle('full')
                b.swap_colors()
        if self.kleurgraad == 1:
            self.graadtoggle.config(text='\N{CIRCLE WITH UPPER HALF BLACK}')
            for b in self.palenplan.belastinglocaties + self.palenplan.locked:
                b.plot.set_fillstyle('top')
        if self.kleurgraad == 2:
            self.graadtoggle.config(text='\N{WHITE CIRCLE}')
            for b in self.palenplan.belastinglocaties + self.palenplan.locked:
                b.plot.set_fillstyle('full')
                b.swap_colors()
        self.canvas.draw()
        
    def switch_legend(self):
        self.legend_switched = not self.legend_switched
        self.replot()
        
    def toggle_fed_text(self):
        belastinglocaties = self.palenplan.alle_belastinglocaties()
        if self.app:
            belastinglocaties = self.app.bs
        self.fed_text = not self.fed_text
        for b in belastinglocaties:
            if not b.fed_text:
                b.create_fed_text(self)
            b.fed_text.set_visible(self.fed_text)
        self.canvas.draw()
    
    def toggle_graad_text(self):
        belastinglocaties = self.palenplan.alle_belastinglocaties()
        if self.app:
            belastinglocaties = self.app.bs
        self.graad_text = not self.graad_text
        for b in belastinglocaties:
            if not b.graad_text:
                b.create_graad_text(self)
            b.graad_text.set_visible(self.graad_text)
        self.canvas.draw()
        
    def update_palenplan_lock(self):
        alle_belastinglocaties = self.palenplan.belastinglocaties + \
                                 self.palenplan.locked
        self.palenplan.belastinglocaties = [b for b in alle_belastinglocaties\
                                      if not b.locked]
        self.palenplan.locked = [b for b in alle_belastinglocaties\
                                      if b.locked]
    
    def toggle_sondering(self):
        self.sonderingen_visible = not self.sonderingen_visible
        for sondering in self.sonderingen:
            sondering.plot.set_visible(self.sonderingen_visible)
            sondering.nummer_text.set_visible(self.sonderingen_visible)
        self.canvas.draw()
    
    #Plot
    def init_figure(self):
        
        self.plotFrame = tk.Frame(self.master)
        self.plotFrame.pack(expand=True, fill=tk.BOTH, side=tk.TOP)
        
        self.fig = Figure(dpi=500)
        self.ax = self.fig.add_subplot(111)
        self.fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
        self.ax.set_axis_off()
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.plotFrame)
        self.toolbar = NavigationToolbar2Tk(self.canvas, self.plotFrame)
        self.canvas.mpl_connect('key_press_event', self.on_key_press)
        self.canvas.mpl_connect('key_release_event', self.on_key_release)
        self.shift_is_held = False
            
        self.canvas.mpl_connect('pick_event', self.onpick)
        self.fig.canvas.mpl_connect('pick_event', self.onpick)
        self.time = time()
        self.app = False
        self.sonderingsvenster = False
        self.ppnselect = []
        self.afmetingselect = []
        self.first_selected = False
        
        self.zoom_factor = 1.5
        self.zoomed = False
        self.canvas.mpl_connect('scroll_event', self.zoom)
        
        self.canvas_widget = self.canvas.get_tk_widget()
        self.canvas_widget.pack(expand=True, fill=tk.BOTH)
        
        props = {'color': 'grey', 'linewidth': 0.5, 'alpha': 0.8}
        self.lasso = LassoSelector(ax=self.ax, onselect=self.onselect, 
                             props = props)
        
        self.sonderingen_visible = True
        self.colormap = colormaps['Reds']
        self.kleurgraad = 0
        self.legend_switched = False
        self.fed_text = False
        self.graad_text = False
        self.text_distance = 1
        
        self.ppn_cmap = cmap_map(lambda x: x*0.7, colormaps['hsv'])
        
        self.canvas.draw()
        
        
    def zoom(self, event):
        
        if event.button == 'up':
            scale_factor = self.zoom_factor
        elif event.button == 'down':
            scale_factor = 1/self.zoom_factor
        else:
            scale_factor = 1
            print(event.button)
        
        cur_xlim = self.ax.get_xlim()
        cur_ylim = self.ax.get_ylim()
    
        xdata = event.xdata
        ydata = event.ydata
        
        if not self.zoomed:
            self.toolbar.push_current()
        self.ax.set_xlim([xdata - (xdata-cur_xlim[0]) / scale_factor, 
               xdata + (cur_xlim[1]-xdata) / scale_factor])
        self.ax.set_ylim([ydata - (ydata-cur_ylim[0]) / scale_factor, 
               ydata + (cur_ylim[1]-ydata) / scale_factor])
        
        self.canvas.draw()
        self.zoomed = True

    def replot(self):
        if self.artists:
            for artist in self.artists:
                try:
                    artist.remove()
                    del artist
                except:
                    pass
            self.plot_points()
        if self.legend_artists:
            for artist in self.legend_artists:
                try:
                    artist.remove()
                    del artist
                except:
                    pass
            self.legend()
        else:
            self.plot()
        if self.app:
            for b in self.app.bs:
                b.marker.set_visible(True)
            self.app.repack()
        self.save_current()
        self.canvas.draw()
        
    def verander_paal(self, b, paal):
        b.huidige_paal = paal
        if not self.legend_switched:
            vorm = vormen[min(self.ppns.index(paal.ppn), len(vormen)-1)]
            kleur = afmetingskleuren[paal.afmeting]
        if self.legend_switched:
            vorm = self.vormen[min(self.afmetingen.index(paal.afmeting), 
                               len(self.vormen)-1)]
            kleur = self.ppn_cmap(self.ppns.index(paal.ppn) / (len(self.ppns)-1))
        b.plot.set_marker(vorm)
        b.plot.set_color(kleur)
        b.aantal_text.set_text(paal.aantal)
        b.graad_text.set_text(str(int(paal.benuttingsgraad*100))+"%")
        b.plot.set_markerfacecoloralt(self.colormap(paal.benuttingsgraad))
       
        
    def update_plot(self):
        self.kosten_label.config(text = self.palenplan.kosten_totaal_str())
        self.benuttingsgraad_label.config(text=self.palenplan.benuttingsgraad_totaal_str())
        for artist in self.legend_artists:
            artist.remove()
            del artist
        self.legend()
        
    def onselect(self, verts):
        if time() - self.time < 1:
            return False
        self.time = time()
        shift = self.shift_is_held
        
        path = Path(verts)
        belastinglocaties = self.palenplan.belastinglocaties + \
            self.palenplan.locked + self.palenplan.geen_opties
        self.xys = [(b.x, b.y) for b in belastinglocaties]
        indexen = np.nonzero(path.contains_points(self.xys))[0]
        
        self.in_lasso = [belastinglocaties[i] for i in indexen]
        
        if not self.in_lasso:
            self.canvas.draw()
            return False
        
        if self.app:
            self.app.onclose(draw=False, empty=False)
        
        if not shift:
            self.selected = self.in_lasso
        else:
            for b in self.in_lasso:
                if b not in self.selected:
                    self.selected.append(b)
                else:
                    self.selected.pop(self.selected.index(b))
        
        for b in self.selected:
            if b.marker:
                b.marker.set_visible(True)
        
        self.plot_sonderinglines()
        self.canvas.draw()
        self.app = palenvenster(self)

    
    def plot_sonderinglines(self):
        if len(self.selected) == 1:
            self.plot_omsluiting(self.selected[0].sonderingen)
        else:
            sonderingslijsten = [b.sonderingen for b in self.selected]
            sonderingen = list(set(sonderingslijsten[0])\
                               .intersection(*sonderingslijsten))
                
            if sonderingen:
                midden = Coordinaten(np.average([b.x for b in self.selected]),
                            np.average([b.y for b in self.selected]))
                sondering0 = sonderingen[0]
                sonderingen.sort(key=lambda x: midden.hoek(x, sondering0))
                self.plot_omsluiting(sonderingen)
            else:
                self.sondering_lines = []
            
    def plot_omsluiting(self, sonderingen):
        omsluiting = sonderingen + [sonderingen[0]]
        x = [s.x for s in omsluiting]
        y = [s.y for s in omsluiting]
        self.sondering_lines = [self.ax.plot(x, y, color='dimgrey', alpha=0.5)[0]]
        for artist in self.sondering_lines:
            self.ax.draw_artist(artist)

    def onpick(self, event):
        if str(type(event.artist.obj)) == "<class 'Classes.Belastinglocatie'>":
            if time() - self.time < 1:
                return None
            self.time = time()
            b = event.artist.obj
            if not b.palen:
                return
            shift = self.shift_is_held
            if self.app:
                self.app.onclose(draw=False, empty=False)
            if not shift:
                self.selected = [b]
            else:
                if b not in self.selected:
                    self.selected.append(b)
                else:
                    self.selected.pop(self.selected.index(b))
            for b in self.selected:
                if b.marker: 
                    b.marker.set_visible(True)
            self.canvas.draw()
            self.plot_sonderinglines()
            self.app = palenvenster(self)
 
        elif str(type(event.artist.obj)) == "<class 'Classes.Sondering'>" and self.sonderingen_visible:
            try:
                self.sonderingsvenster.onclose()
            except:
                pass
            self.sondering = event.artist.obj
            self.sonderingsvenster = sonderingsvenster(self)
            
        elif str(type(event.artist.obj)) == "<class 'matplotlib.collections.PathCollection'>":
            waarde = float(event.artist.obj.get_label())
            
            if not self.shift_is_held:
                configuraties = list(np.array(pd.read_excel(project_path('Configuraties.xlsx'), 
                                     sheet_name='Configuraties', 
                                     header=None)))
                waarden = [c[0] for c in configuraties]
    
                if waarde in waarden:
                    waarden.remove(waarde)
                    Configuratie.uitgesloten.remove(float(waarde))
                    
                    for text in self.legend_texts:
                        if float(text.get_text())==waarde:
                            text.set_color('black')
                    
                else:
                    waarden.append(waarde)
                    Configuratie.uitgesloten.append(float(waarde))
                    
                    for text in self.legend_texts:
                        if float(text.get_text())==waarde:
                            text.set_color('lightgrey')
                        
                dataframe = pd.DataFrame(np.array([[waarde] for waarde in waarden]))
                dataframe.to_excel(project_path("Configuraties.xlsx"), sheet_name='Configuraties', 
                             index=False, header=False)
            
                self.canvas.draw()
                self.fig.canvas.draw()
                
            else:
                self.selectie_waarde([waarde])
                
    
    def selectie_waarde(self, waarden, clear=False):
        if any([waarde not in self.gebruikte_ppns and waarde not in \
                self.gebruikte_afmetingen for waarde in waarden]):
            return None
        if self.app:
            self.app.onclose(draw=False, empty=False)
            if not self.first_selected:
                self.first_selected = self.selected
        else:
            self.first_selected = self.palenplan.belastinglocaties + \
                                self.palenplan.locked
        if clear:
            for waarde in waarden:
                if waarde in self.gebruikte_ppns:
                    self.ppnselect = [waarde]
                if waarde in self.gebruikte_afmetingen:
                    self.afmetingselect = [waarde]
        else:
            for waarde in waarden: 
                if waarde in self.gebruikte_ppns and waarde not in self.ppnselect:
                    self.ppnselect.append(waarde)
                elif waarde in self.gebruikte_ppns:
                    self.ppnselect.pop(self.ppnselect.index(waarde))
                elif waarde in self.gebruikte_afmetingen and waarde not in self.afmetingselect:
                    self.afmetingselect.append(waarde)
                elif waarde in self.gebruikte_afmetingen:
                    self.afmetingselect.pop(self.afmetingselect.index(waarde))
            
        self.selected =  [b for b in self.first_selected if 
                          (not self.ppnselect or 
                           b.huidige_paal.ppn in self.ppnselect) and 
                          (not self.afmetingselect or 
                           b.huidige_paal.afmeting in self.afmetingselect)]
        
        for b in self.selected:
            b.marker.set_visible(True)
        if self.selected:
            self.plot_sonderinglines()
            self.app = palenvenster(self)
        self.update_plot()
        self.canvas.draw()
        self.fig.canvas.draw()
    
    def select_all(self, event):
        if self.app:
            self.app.onclose()
        self.selected = self.all_in_view()
        for b in self.selected:
            b.marker.set_visible(True)
        if self.selected:
            self.plot_sonderinglines()
            self.app = palenvenster(self)
        self.canvas.draw()
    
    def all_in_view(self):
        xmin, xmax = self.ax.get_xlim()
        ymin, ymax = self.ax.get_ylim()
        return [b for b in self.palenplan.alle_belastinglocaties() if
                         xmin < b.x < xmax and ymin < b.y < ymax]
    
    def on_key_press(self, event):
        if event.key == 'shift':
            self.shift_is_held = True
        else:
            key_press_handler(event, self.canvas, self.toolbar)
    
    def on_key_release(self, event):
        if event.key == 'shift':
            self.shift_is_held = False

    def plot(self, resize=True):
        
        self.ax.set_axis_off()
        folder_name = os.path.basename(os.getcwd())
        #self.ax.set_title(folder_name, fontsize=5)
        
        self.sonderingen = Sondering.instances
        for sondering in self.sonderingen:
            sondering.plot = self.ax.plot(sondering.x, sondering.y,
                            '.',  color='lightgrey', ms=6*self.size)[0]
            sondering.plot.set_picker(True)
            sondering.plot.set_pickradius(1.5)
            sondering.plot.obj = sondering
            
            sondering.nummer_text = self.ax.text(sondering.x, sondering.y,
                  sondering.nummer, ha = 'center', va= 'center',
                  color = 'black', fontsize=3*self.size)
            
            sondering.plot.set_visible(self.sonderingen_visible)
            sondering.nummer_text.set_visible(self.sonderingen_visible)
    
        self.plot_points()
        
        self.ax.set_aspect('equal')
        
        # x = [b.x for b in self.palenplan.alle_belastinglocaties()]
        # y = [b.y for b in self.palenplan.alle_belastinglocaties()]
        self.ax.relim()
        self.ax.autoscale_view()
        self.ax.autoscale(False, tight=False)
        
        self.legend()
        
    def plot_points(self):
        
        self.artists = []
        
        self.ppns = list(set([config.ppn for config in Configuratie.mogelijk]))
        self.ppns.sort(reverse=True)
        self.ppns.sort(key = lambda x: x in Configuratie.uitgesloten)
        
        for b in self.palenplan.belastinglocaties + self.palenplan.locked:
    
            b.create_plot(self)
            b.create_aantal_text(self)
            self.artists.extend([b.plot, b.aantal_text])
            self.artists.append(b.aantal_text)
            
        for b in self.palenplan.locked:
            b.plot.set_markeredgecolor('black')
                
        for b in self.palenplan.geen_opties:
            b.plot = self.ax.plot(b.x, b.y, 'x', color='lightgrey', ms=3*self.size, clip_on=False)[0]
            b.plot.set_picker(True)
            b.plot.set_pickradius(1.5)
            b.plot.obj = b
            self.artists.append(b.plot)
            b.mark(self)
            b.marker.set_visible(False)
            b.mark_red(self)
            b.red_marker.set_visible(False)
        
        
    def legend(self):
        
        self.legend_artists = []
        self.ppns = list(set([config.ppn for config in Configuratie.mogelijk]))
        self.ppns.sort(reverse=True)
        self.ppns.sort(key = lambda x: x in Configuratie.uitgesloten)
        self.gebruikte_ppns = list(set([b.huidige_paal.ppn for b in \
                             self.palenplan.belastinglocaties + \
                                 self.palenplan.locked]))
        ppn_markers = []
        markersize = 7
        edgewidth = 0.5
        for ppn in self.ppns:
            if not self.legend_switched:
                color = ['lightgrey', 'dimgrey'][int(ppn in self.gebruikte_ppns)]
                vorm = vormen[min(self.ppns.index(ppn), len(vormen)-1)]
                mec = 'none'
                if ppn in self.ppnselect:
                   mec = 'black'
                ppn_marker = self.ax.scatter([], [], 
                         marker=vorm, edgecolors=mec, linewidths=edgewidth,
                         c=color, label=str(ppn), s=markersize)
                ppn_markers.append(ppn_marker)
                
            if self.legend_switched:
                color_value = self.ppns.index(ppn) / (len(self.ppns)-1)
                color = ['lightgrey', self.ppn_cmap(color_value)]\
                [int(ppn in self.gebruikte_ppns)]
                mec = 'none'
                if ppn in self.ppnselect:
                   mec = 'black'
                ppn_marker = self.ax.scatter([], [], marker='o', linewidths=edgewidth,
                                edgecolors=mec,color=color, label = str(ppn), s=markersize)
                ppn_markers.append(ppn_marker)
        
        ppn_markers.sort(key = lambda x: float(x.get_label()), reverse=True)
        ppn_legend = self.fig.legend(handles=ppn_markers, loc='outside center left', prop={'size': 2.5})
        self.ax.add_artist(ppn_legend)
        self.legend_artists.append(ppn_legend)
        
        for artist in ppn_legend.legend_handles:
            artist.set_picker(5)
            artist.obj = artist

        self.afmetingen = list(set([c.afmeting for c in Configuratie.mogelijk]))
        self.afmetingen.sort()
        #afmetingen.sort(key=lambda x: x in Configuratie.uitgesloten[0])
        self.gebruikte_afmetingen = list(set([b.huidige_paal.afmeting for b \
                         in self.palenplan.belastinglocaties + \
                             self.palenplan.locked]))
        
        afmeting_markers = []
        for afmeting in self.afmetingen:
            if not self.legend_switched:
                color = ['lightgrey', afmetingskleuren[afmeting]]\
                    [int(afmeting in self.gebruikte_afmetingen)]
                marker = ['s', 'o'][int(afmeting in rond)]
                mec = 'none'
                if afmeting in self.afmetingselect:
                    mec = 'black'
                afmeting_marker = self.ax.scatter([], [], marker=marker, 
                                    edgecolors=mec, linewidths=edgewidth, 
                                    color=color, label = str(afmeting), s=markersize)
                
                afmeting_markers.append(afmeting_marker)
                
            if self.legend_switched:
                color = ['lightgrey', 'dimgrey'][int(afmeting in self.gebruikte_afmetingen)]
                vorm = vormen[min(self.afmetingen.index(afmeting), 
                                  len(vormen)-1)]
                mec = 'none'
                if afmeting in self.afmetingselect:
                    mec = 'black'
                afmeting_marker = self.ax.scatter([], [], 
                         marker=vorm, edgecolors=mec, linewidths=edgewidth,
                         c=color, label=str(afmeting), s=markersize)
                afmeting_markers.append(afmeting_marker)
                
        afmeting_legend = self.fig.legend(handles=afmeting_markers, loc='outside lower left', prop={'size': 2.5})
        #Niet opnieuw ax.add_artist: dan runt picker twee keer!
        self.legend_artists.append(afmeting_legend)
        
        
        for artist in afmeting_legend.legend_handles:
            artist.set_picker(5)
            artist.obj = artist
        
        self.legend_texts = ppn_legend.get_texts() + afmeting_legend.get_texts()
        for text in self.legend_texts:
            if float(text.get_text()) in Configuratie.uitgesloten:
                text.set_color('lightgrey')
            else:
                text.set_color('black')
        
            

class BusyManager:
    def __init__(self, widget):
        self.toplevel = widget.winfo_toplevel()
        self.widgets = {}
        
    def busy(self, widget=None):
        if widget is None:
            w = self.toplevel
        else:
            w = widget

        if str(w) not in self.widgets:
            try:
                cursor = w.cget("cursor")
                if cursor != "watch":
                    self.widgets[str(w)] = (w, cursor)
                    w.config(cursor="watch")
            except tk.TclError:
                pass
        
        for w in w.children.values():
            self.busy(w)
    
    def notbusy(self):
        for w, cursor in self.widgets.values():
            try:
                w.config(cursor=cursor)
            except tk.TclError:
                    pass
        self.widgets = {}
        
def main():
    
    root = tk.Tk()
    vraag_projectmap(root)
    app = Window(root)
    root.mainloop()

if __name__ == "__main__":
    main()
    
    
    
    
        
    
        
        
        

        
