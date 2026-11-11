import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace
from ui import UI
from process_identity import is_application_process


class NativeCheckboxTests(unittest.TestCase):
    def controller(self, name, mac=True, role="AXCheckBox"):
        ui = UI.__new__(UI)
        ui.mac = mac
        node = {"name": name, "role": role, "checked": False, "enabled": True}
        ui.tree = [node]
        ui.snapshot = lambda: ui.tree
        def press(found, physical=False):
            found["checked"] = not found["checked"]
        ui.press = press
        return ui, node

    def test_mac_checkbox_accepts_the_full_label_repeated_by_webkit(self):
        ui, node = self.controller("Save as new pile plan Save as new pile plan")
        ui.check("Save as new pile plan", True)
        self.assertTrue(node["checked"])

    def test_mac_checkbox_still_accepts_a_single_accessible_label(self):
        ui, node = self.controller("Save as new pile plan")
        ui.check("Save as new pile plan", True)
        self.assertTrue(node["checked"])

    def test_checkbox_alias_does_not_match_a_partial_or_unrelated_label(self):
        for name in ["Save as new pile plan details", "Save as new pile plan Save as new pile plan details"]:
            with self.subTest(name=name):
                ui, node = self.controller(name)
                with self.assertRaises(AssertionError):
                    ui.check("Save as new pile plan", True)
                self.assertFalse(node["checked"])

    def test_repeated_label_alias_is_limited_to_mac_checkboxes(self):
        for mac, role in [(False, "check box"), (True, "AXButton")]:
            with self.subTest(mac=mac, role=role):
                ui, node = self.controller("Save as new pile plan Save as new pile plan", mac, role)
                with self.assertRaises(AssertionError):
                    ui.check("Save as new pile plan", True)
                self.assertFalse(node["checked"])

    def test_two_matching_controls_are_still_rejected_as_ambiguous(self):
        ui, node = self.controller("Save as new pile plan")
        ui.tree.append({**node, "name": "Save as new pile plan Save as new pile plan"})
        with self.assertRaises(AssertionError):
            ui.check("Save as new pile plan", True)
        self.assertFalse(node["checked"])


class NativeFileDialogTests(unittest.TestCase):
    def test_cancel_waits_until_the_dialog_is_absent(self):
        ui = UI.__new__(UI)
        ui.key = Mock()
        snapshots = iter([[{"role": "AXSheet"}], [{"role": "AXWindow"}]])

        def snapshot():
            ui.tree = next(snapshots)
            return ui.tree

        ui.snapshot = Mock(side_effect=snapshot)
        with patch("ui.time.sleep"):
            ui.cancel_file_dialog()
        ui.key.assert_called_once_with("escape")
        self.assertEqual(ui.snapshot.call_count, 2)


class ApplicationIdentityTests(unittest.TestCase):
    def test_process_selection_excludes_workers_and_respects_the_launched_pid(self):
        binary = "/usr/bin/pile-plan-studio"
        mount = "/tmp/.mount_package/usr/bin/pile-plan-studio"
        cases = [
            (binary, [binary], False, 10, None, True),
            (binary, [binary, "--opps-ilp-worker"], False, 10, None, False),
            (mount, [mount], True, 20, 20, True),
            (mount, [mount], True, 19, 20, False),
            (mount, [mount, "--opps-ilp-worker"], True, 20, 20, False),
            ("/tmp/another-application", [binary], True, 20, 20, False),
            ("/usr/bin/another-application", [binary], False, 10, None, False),
            (binary, [], False, 10, None, False),
        ]
        for executable, arguments, portable, pid, launched, expected in cases:
            with self.subTest(executable=executable, arguments=arguments, pid=pid):
                self.assertEqual(is_application_process(executable, arguments, binary,
                    portable=portable, pid=pid, launched_pid=launched), expected)


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
