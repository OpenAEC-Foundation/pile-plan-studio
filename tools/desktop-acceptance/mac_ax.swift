// External test controller, never linked into or shipped with the application.
import AppKit
import ApplicationServices

var elements: [AXUIElement] = []
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func string(_ e: AXUIElement, _ name: String) -> String { return (attr(e, name) as? String) ?? "" }
func snapshot(_ e: AXUIElement, _ depth: Int = 0, _ parent: Int = -1) -> [[String: Any]] {
    if depth > 35 || elements.count > 18000 { return [] }
    let id = elements.count; elements.append(e)
    var node: [String: Any] = ["id":id, "parent":parent, "role":string(e, kAXRoleAttribute),
      "name":string(e, kAXTitleAttribute), "description":string(e, kAXDescriptionAttribute),
      "value":string(e, kAXValueAttribute), "enabled":(attr(e, kAXEnabledAttribute) as? Bool) ?? true]
    var p = CGPoint.zero; var s = CGSize.zero
    if let v = attr(e, kAXPositionAttribute), CFGetTypeID(v) == AXValueGetTypeID() {
        AXValueGetValue(v as! AXValue, .cgPoint, &p)
    }
    if let v = attr(e, kAXSizeAttribute), CFGetTypeID(v) == AXValueGetTypeID() {
        AXValueGetValue(v as! AXValue, .cgSize, &s)
    }
    node["rect"] = [p.x,p.y,s.width,s.height]
    if string(e,kAXRoleAttribute) == "AXCheckBox" {
        node["checked"] = (attr(e,kAXValueAttribute) as? NSNumber)?.intValue == 1
    }
    var result = [node]
    for child in (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
        result += snapshot(child, depth + 1, id)
    }
    return result
}
func key(_ code: CGKeyCode, _ flags: CGEventFlags = []) {
    for down in [true, false] {
        let event = CGEvent(keyboardEventSource:nil, virtualKey:code, keyDown:down)!
        event.flags = flags; event.post(tap:.cghidEventTap)
    }
}
func request(_ data: [String:Any]) throws -> Any {
    switch data["op"] as? String {
    case "trusted": return AXIsProcessTrusted()
    case "snapshot":
        elements = []
        return snapshot(AXUIElementCreateApplication(pid_t(data["pid"] as! Int)))
    case "press":
        let e = elements[data["id"] as! Int]
        let status = AXUIElementPerformAction(e, kAXPressAction as CFString)
        guard status == .success else { throw NSError(domain:"AXPress",code:Int(status.rawValue)) }
        return true
    case "set":
        let status = AXUIElementSetAttributeValue(elements[data["id"] as! Int], kAXValueAttribute as CFString,
          (data["value"] as! String) as CFString)
        guard status == .success else { throw NSError(domain:"AXSet",code:Int(status.rawValue)) }
        return true
    case "key":
        var flags: CGEventFlags = []
        for modifier in (data["modifiers"] as? [String]) ?? [] {
            switch modifier { case "meta":flags.insert(.maskCommand); case "ctrl":flags.insert(.maskControl)
              case "shift":flags.insert(.maskShift); case "alt":flags.insert(.maskAlternate); default:break }
        }
        key(CGKeyCode(data["code"] as! Int), flags); return true
    case "text":
        let text = data["value"] as! String
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType:.string)
        key(9, .maskCommand); return true
    case "activate":
        guard let app = NSRunningApplication(processIdentifier:pid_t(data["pid"] as! Int)) else { return false }
        return app.activate(options:[.activateIgnoringOtherApps])
    case "click":
        let point = CGPoint(x:data["x"] as! Double,y:data["y"] as! Double)
        for type in [CGEventType.leftMouseDown, .leftMouseUp] {
            CGEvent(mouseEventSource:nil, mouseType:type, mouseCursorPosition:point, mouseButton:.left)!.post(tap:.cghidEventTap)
        }
        return true
    default: throw NSError(domain:"UnknownOperation",code:1)
    }
}
while let line = readLine() {
    do {
        let input = try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any]
        let output = try request(input)
        let bytes = try JSONSerialization.data(withJSONObject:["ok":true,"result":output],options:[.sortedKeys])
        print(String(data:bytes,encoding:.utf8)!); fflush(stdout)
    } catch {
        let bytes = try! JSONSerialization.data(withJSONObject:["ok":false,"error":String(describing:error)])
        print(String(data:bytes,encoding:.utf8)!); fflush(stdout)
    }
}
