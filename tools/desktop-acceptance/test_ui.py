import unittest
from unittest.mock import Mock
from ui import UI


class VersionCheckTests(unittest.TestCase):
    def test_reads_version_from_about_when_titlebar_text_is_not_accessible(self):
        ui = UI.__new__(UI)
        visible = [{"name": "Open Pile Plan Studio"}]
        actions = []
        def click(name):
            actions.append(name)
            if name == "About":
                visible[:] = [{"name": "", "value": "Version 2026.45.1 · Alpha"}]
        ui.click = click
        ui.wait = lambda predicate: self.assertTrue(predicate(visible))
        ui.verify_version("2026.45.1")
        self.assertEqual(actions, ["File", "About"])

    def test_rejects_another_product_version_in_about(self):
        ui = UI.__new__(UI)
        ui.click = Mock()
        ui.wait = lambda predicate: self.assertTrue(predicate([
            {"name": "Version 2026.45.10 · Alpha"},
        ]))
        with self.assertRaises(AssertionError):
            ui.verify_version("2026.45.1")


if __name__ == "__main__":
    unittest.main()
