from Paalopties import paalopties
from Andere_lagen import optimaliseer_palenplan

def palenplanroutine(app):
    app.manager.busy()
    individueel_palenplan = paalopties(app)
    app.palenplan = optimaliseer_palenplan(individueel_palenplan, app)
    app.manager.notbusy()