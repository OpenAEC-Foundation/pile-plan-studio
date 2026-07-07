import os
import sys
from types import SimpleNamespace
from unittest.mock import patch
import unittest

sys.path.insert(0, os.path.abspath("legacy"))

from Classes import Belastinglocatie, Configuratie, Paal, Sondering, Sonderingsmeting
from Paalopties import is_paal_optie, sonderingsmetingen, voeg_palen_toe


class PaaloptiesTests(unittest.TestCase):

    def setUp(self):
        Sondering.instances = []
        Configuratie.opties = []
        Configuratie.mogelijk = []
        Configuratie.gekozen = []
        Configuratie.uitgesloten = []

    def maak_app(self, max_aantal=3, max_graad=1.0):
        parameters = SimpleNamespace(max_aantal=max_aantal, max_graad=max_graad)
        return SimpleNamespace(parameters=parameters)

    def maak_belastinglocatie(self, fed=100):
        return Belastinglocatie(1, 0, 0, fed)

    def test_draagvermogens_worden_gekoppeld_aan_geselecteerde_sonderingen(self):
        belastinglocatie = self.maak_belastinglocatie()
        sondering_1 = Sondering(101, 0, 0)
        sondering_2 = Sondering(102, 10, 0)
        belastinglocatie.sonderingen = [sondering_1, sondering_2]
        draagvermogens = [
            [101, 102, 999],
            [-10.0, -10.0, -10.0],
            [220, 220, 220],
            [400, 350, 100],
        ]

        sonderingsmetingen(belastinglocatie, draagvermogens)

        self.assertEqual(1, len(sondering_1.sonderingsmetingen))
        self.assertEqual(1, len(sondering_2.sonderingsmetingen))
        self.assertEqual(400, sondering_1.sonderingsmetingen[0].frd)
        self.assertEqual(350, sondering_2.sonderingsmetingen[0].frd)

    def test_paaloptie_is_geldig_als_alle_geselecteerde_sonderingen_voldoen(self):
        belastinglocatie = self.maak_belastinglocatie(fed=300)
        sondering_1 = Sondering(101, 0, 0)
        sondering_2 = Sondering(102, 10, 0)
        sondering_1.sonderingsmetingen = [Sonderingsmeting(-10.0, 220, 400)]
        sondering_2.sonderingsmetingen = [Sonderingsmeting(-10.0, 220, 350)]
        belastinglocatie.sonderingen = [sondering_1, sondering_2]

        optie, frd_min, frd_sondering = is_paal_optie(
            belastinglocatie,
            Configuratie(-10.0, 220),
            1,
            self.maak_app(max_graad=1.0),
        )

        self.assertTrue(optie)
        self.assertEqual(350, frd_min)
        self.assertIs(sondering_2, frd_sondering)

    def test_ontbrekend_draagvermogen_bij_geselecteerde_sondering_keurt_optie_af(self):
        belastinglocatie = self.maak_belastinglocatie(fed=100)
        sondering_1 = Sondering(101, 0, 0)
        sondering_2 = Sondering(102, 10, 0)
        sondering_1.sonderingsmetingen = [Sonderingsmeting(-10.0, 220, 400)]
        sondering_2.sonderingsmetingen = []
        belastinglocatie.sonderingen = [sondering_1, sondering_2]

        optie, frd_min, frd_sondering = is_paal_optie(
            belastinglocatie,
            Configuratie(-10.0, 220),
            1,
            self.maak_app(max_graad=1.0),
        )

        self.assertFalse(optie)
        self.assertEqual(10, frd_min)
        self.assertIsNone(frd_sondering)

    def test_benuttingsgraad_volgt_uit_belasting_en_maatgevende_frd(self):
        belastinglocatie = self.maak_belastinglocatie(fed=120)
        sondering = Sondering(101, 0, 0)
        sondering.sonderingsmetingen = [Sonderingsmeting(-10.0, 220, 200)]
        belastinglocatie.sonderingen = [sondering]
        Configuratie.opties = [Configuratie(-10.0, 220)]

        with patch.object(Paal, "get_kosten", return_value=0):
            voeg_palen_toe(belastinglocatie, self.maak_app(max_aantal=1, max_graad=1.0))

        self.assertEqual(1, len(belastinglocatie.palen))
        self.assertEqual(0.6, belastinglocatie.palen[0].benuttingsgraad)


if __name__ == "__main__":
    unittest.main()
