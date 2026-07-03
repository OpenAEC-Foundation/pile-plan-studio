import os
import unittest

import Projectmap


class ProjectmapTests(unittest.TestCase):

    def setUp(self):
        Projectmap.reset_projectmap()

    def tearDown(self):
        Projectmap.reset_projectmap()

    def test_relative_projectmap_is_used_for_files(self):
        Projectmap.set_projectmap("sample_project")

        expected = os.path.abspath(os.path.join("sample_project", "Paalkosten.xlsx"))
        self.assertEqual(expected, Projectmap.project_path("Paalkosten.xlsx"))

    def test_empty_projectmap_defaults_to_sample_project(self):
        Projectmap.set_projectmap("")

        expected = os.path.abspath(os.path.join("sample_project", "Sonderingen.xlsx"))
        self.assertEqual(expected, Projectmap.project_path("Sonderingen.xlsx"))


if __name__ == "__main__":
    unittest.main()
