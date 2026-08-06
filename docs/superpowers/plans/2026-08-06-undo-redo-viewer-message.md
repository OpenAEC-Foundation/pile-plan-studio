# Undo and Redo Viewer Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Undo and Redo results as a temporary Blender-style message centered at the bottom of the pile plan viewer.

**Architecture:** Separate history feedback from the existing general status-message stream in `App.tsx`. Render history feedback through a focused, pointer-transparent `HistoryNotice` component inside the viewer workspace, while recovery and other general status messages remain in `StatusBar`.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner

## Global Constraints

- The overlay is used only for Undo and Redo results.
- It is positioned relative to the viewer and above the application status bar.
- It remains visible for approximately 3.5 seconds and fades before removal.
- It accepts no pointer input and cannot block viewer interaction.
- A subsequent history action replaces the current notice and restarts its lifetime.
- Existing localized history text is reused unchanged.

---

### Task 1: Add the viewer history notice

**Files:**
- Create: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.tsx`
- Create: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.css`
- Create: `apps/pile-plan-studio/src/components/viewer/HistoryNotice.test.ts`

**Interfaces:**
- Consumes: `message: string` and `noticeId: number` from `App.tsx`.
- Produces: `HistoryNotice({ message, noticeId }: Props)`, an `aria-live="polite"` viewer overlay that remounts when `noticeId` changes.

- [ ] **Step 1: Write the failing component test**

```ts
it("renders history feedback as a pointer-transparent viewer notice", () => {
  const source = readFileSync(resolve(import.meta.dirname, "HistoryNotice.tsx"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "HistoryNotice.css"), "utf8");

  assert.match(source, /aria-live="polite"/);
  assert.match(source, /key=\{noticeId\}/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /left:\s*50%/);
  assert.match(css, /bottom:/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /history-notice-fade/);
});
```

- [ ] **Step 2: Run the focused test and verify that it fails**

Run: `npm test -- --test-name-pattern="viewer notice"`

Expected: FAIL because `HistoryNotice.tsx` and `HistoryNotice.css` do not exist.

- [ ] **Step 3: Implement the notice component and styling**

```tsx
import "./HistoryNotice.css";

type Props = {
  message: string;
  noticeId: number;
};

export default function HistoryNotice({ message, noticeId }: Props) {
  return (
    <div className="history-notice-region" aria-live="polite" aria-atomic="true">
      {message && (
        <div key={noticeId} className="history-notice" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
```

Use CSS that centers the notice with `left: 50%` and `transform: translateX(-50%)`, places it `bottom: 16px`, limits it to two lines and a sensible maximum width, sets `pointer-events: none`, and applies a short entrance plus `history-notice-fade` exit animation ending before the 3.5-second React timeout.

- [ ] **Step 4: Run the focused test and verify that it passes**

Run: `npm test -- --test-name-pattern="viewer notice"`

Expected: PASS.

- [ ] **Step 5: Commit the component**

```powershell
git add apps/pile-plan-studio/src/components/viewer/HistoryNotice.tsx apps/pile-plan-studio/src/components/viewer/HistoryNotice.css apps/pile-plan-studio/src/components/viewer/HistoryNotice.test.ts
git commit -m "feat: add viewer history notice"
```

### Task 2: Separate history feedback from general status feedback

**Files:**
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/App.css`
- Modify: `apps/pile-plan-studio/src/AppUndo.test.ts`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.css`
- Modify: `apps/pile-plan-studio/src/components/template/StatusBar.test.ts`

**Interfaces:**
- Consumes: `managedProject.lastResult` and `describeHistoryResult(...)`.
- Produces: a monotonically increasing `{ id: number; message: string }` history notice passed to `HistoryNotice`; general `statusMessage` remains passed to `StatusBar`.

- [ ] **Step 1: Update integration tests first**

Add assertions that `App.tsx` imports and renders `HistoryNotice`, that `managedProject.lastResult` calls `showHistoryNotice`, and that `StatusBar` receives `statusMessage` rather than `historyMessage`. Change the status-bar test to require a generic optional `message` prop and verify that it no longer contains `status-history-message`.

```ts
assert.match(source, /import HistoryNotice/);
assert.match(source, /showHistoryNotice\(describeHistoryResult/);
assert.match(source, /<HistoryNotice/);
assert.match(source, /message=\{statusMessage\}/);
assert.doesNotMatch(source, /historyMessage=\{historyMessage\}/);
```

- [ ] **Step 2: Run the focused tests and verify that they fail**

Run: `npm test -- --test-name-pattern="Undo integration|status bar"`

Expected: FAIL because history feedback is still rendered by `StatusBar`.

- [ ] **Step 3: Split the state and timers in `App.tsx`**

Keep the existing `showStatusMessage` behavior for recovery and startup status. Add independent history state and a monotonically increasing ID so repeated identical Undo messages restart the CSS animation:

```ts
const [historyNotice, setHistoryNotice] = useState({ id: 0, message: "" });
const historyNoticeIdRef = useRef(0);
const historyNoticeTimeoutRef = useRef<number | null>(null);

const showHistoryNotice = useCallback((message: string) => {
  if (historyNoticeTimeoutRef.current !== null) {
    window.clearTimeout(historyNoticeTimeoutRef.current);
  }
  historyNoticeIdRef.current += 1;
  setHistoryNotice({ id: historyNoticeIdRef.current, message });
  historyNoticeTimeoutRef.current = window.setTimeout(() => {
    setHistoryNotice((current) => ({ ...current, message: "" }));
    historyNoticeTimeoutRef.current = null;
  }, 3500);
}, []);
```

Call `showHistoryNotice(describeHistoryResult(...))` from the `managedProject.lastResult` effect. Clear both timers during unmount.

- [ ] **Step 4: Render the notice inside the workspace**

```tsx
<main className="workspace" aria-label="Pile plan workspace">
  <PilePlanWorkspace state={projectState} onStateChange={handleProjectStateChange} />
  <HistoryNotice message={historyNotice.message} noticeId={historyNotice.id} />
</main>
```

Set `.workspace { position: relative; }` so the notice follows the actual viewer width when either side panel is resized.

- [ ] **Step 5: Make `StatusBar` generic again**

Rename its prop to `message?: string`, keep its `aria-live="polite"` region for recovery/status feedback, and remove the history-specific CSS class name. Pass `statusMessage` from `App.tsx`.

- [ ] **Step 6: Run the focused tests and verify that they pass**

Run: `npm test -- --test-name-pattern="Undo integration|status bar|viewer notice"`

Expected: PASS.

- [ ] **Step 7: Run full verification**

Run: `npm test`

Expected: all frontend tests pass.

Run: `npm run build`

Expected: the WASM package, TypeScript application, and Vite production bundle build successfully.

- [ ] **Step 8: Manually verify the viewer behavior**

Open the live viewer, change one pile, and trigger Undo and Redo from both the title bar and keyboard shortcuts. Confirm that the notice is centered over the viewer, replaces itself during rapid actions, disappears automatically, does not block pan/zoom/select, and remains centered after resizing the explorer and right panel.

- [ ] **Step 9: Commit the integration**

```powershell
git add apps/pile-plan-studio/src/App.tsx apps/pile-plan-studio/src/App.css apps/pile-plan-studio/src/AppUndo.test.ts apps/pile-plan-studio/src/components/template/StatusBar.tsx apps/pile-plan-studio/src/components/template/StatusBar.css apps/pile-plan-studio/src/components/template/StatusBar.test.ts
git commit -m "feat: move history feedback into viewer"
```
