import os
import unittest

import Datamap


class DatamapTests(unittest.TestCase):

    def setUp(self):
        Datamap.reset_datamap()

    def tearDown(self):
        Datamap.reset_datamap()

    def test_relative_datamap_is_used_for_files(self):
        Datamap.set_datamap("sample_data")

        expected = os.path.abspath(os.path.join("sample_data", "Paalkosten.xlsx"))
        self.assertEqual(expected, Datamap.data_path("Paalkosten.xlsx"))

    def test_empty_datamap_defaults_to_sample_data(self):
        Datamap.set_datamap("")

        expected = os.path.abspath(os.path.join("sample_data", "Sonderingen.xlsx"))
        self.assertEqual(expected, Datamap.data_path("Sonderingen.xlsx"))


if __name__ == "__main__":
    unittest.main()
