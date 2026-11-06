import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace
from ui import UI


class SnapshotRetryTests(unittest.TestCase):
    def test_reobserves_a_retired_text_interface_without_using_partial_state(self):
        class AccessibilityError(Exception):
            pass
        ui = UI.__new__(UI)
        ui.mac = False
        ui.GLib = SimpleNamespace(GError=AccessibilityError)
        complete = [{"name": "Optimize", "role": "push button"}]
        ui.linux_snapshot = Mock(side_effect=[AccessibilityError(
            'No such interface “org.a11y.atspi.Text” on object at path /retired'), complete])
        with patch("ui.time.sleep"):
            self.assertEqual(ui.snapshot(), complete)

    def test_does_not_hide_an_unrelated_accessibility_failure(self):
        class AccessibilityError(Exception):
            pass
        ui = UI.__new__(UI)
        ui.mac = False
        ui.GLib = SimpleNamespace(GError=AccessibilityError)
        ui.linux_snapshot = Mock(side_effect=AccessibilityError("connection refused"))
        with self.assertRaisesRegex(AccessibilityError, "connection refused"):
            ui.snapshot()

    def test_retry_limit_still_fails_a_persistently_missing_text_interface(self):
        class AccessibilityError(Exception):
            pass
        ui = UI.__new__(UI)
        ui.mac = False
        ui.GLib = SimpleNamespace(GError=AccessibilityError)
        ui.linux_snapshot = Mock(side_effect=AccessibilityError('No such interface “org.a11y.atspi.Text”'))
        with patch("ui.time.sleep"), self.assertRaises(AccessibilityError):
            ui.snapshot()
        self.assertEqual(ui.linux_snapshot.call_count, 4)


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
