# Personal Place 2.0 — Implementation Architecture Review

> Architecture and staged implementation plan for the 2.0 consolidation pass.
>
> Read `PRODUCT_2_0_INDEX.md`, `TODO.md`, `PRODUCT_2_0_C_FOCUS_MODE.md`, and `PRODUCT_2_0_D_VISUAL_SYSTEM.md` first.
>
> This document translates the resolved A / B / C / D product targets into an implementation structure that can be handed to Codex Luna in bounded stages.

## Status

**ARCHITECTURE REVIEW COMPLETE — READY FOR STAGED IMPLEMENTATION HANDOFFS**

This is not one giant implementation prompt.

Do not ask Luna to "implement 2.0" from this document in one pass.

The work should be executed stage by stage, with validation and review between stages.

---

# 1. Executive architecture conclusion

The 2.0 consolidation does **not** require a new product domain.

The existing domains are sufficient:

- Dashboard / Page;
- Place;
- Todo;
- Focus;
- Calendar;
- Activity;
- settings / backup / recovery.

The central implementation problem is that the **frontend orchestration model still reflects the old Dashboard / widget product**.

The most important changes are therefore:

1. make app-level navigation capable of expressing Today as home, contextual Place navigation, and Focus Mode;
2. make Focus state a single app-level source of truth rather than something independently controlled by Today and widgets;
3. make Todo a first-class system workspace rather than requiring a Todo widget card to exist;
4. let Today request app-level transitions instead of directly owning every navigation / Focus consequence;
5. demote Page organization and legacy widget administration from normal browsing;
6. migrate visual hierarchy deliberately instead of appending another layer of CSS overrides.

### Important scope result

The core 2.0 pass should remain **schema-neutral**.

Target:

```text
SQLite schema: keep v6
backup format: keep v4
```

No database migration is required merely to implement A / B / C / D.

Do not bump schema or backup format unless implementation discovers a genuine persistent-data requirement that is absent today.

---

# 2. Existing architecture that should be preserved

## Domain boundaries

Do not collapse Today, Todo, Focus, Place, Calendar and Activity into one giant state object.

Their conceptual separation is useful and already supports the product direction.

Preserve especially:

```text
plannedFor != dueAt
Focus ended != Todo completed
starting Focus != launching Place
Activity = retrospective
Today = orchestration
```

## Backend Focus contract

The current Rust Focus domain already provides the important persistent contract:

- idle / running / paused;
- focus / shortBreak / longBreak phases;
- linked Todo ID;
- linked Group / Place ID;
- start guard when a session is already running / paused;
- pause / resume;
- explicit stop;
- expiry resolution;
- session history.

2.0 should build a better frontend state machine on top of this rather than replacing the backend model.

## Local-first data ownership

Do not move product state into browser-only storage merely to simplify the redesign.

Keep the existing Tauri / SQLite ownership model.

## Existing Todo planning semantics

Preserve 1.9 behavior:

- `plannedFor` is a local `YYYY-MM-DD` intent date;
- it remains independent from deadline;
- completion and recurrence semantics remain unchanged;
- no automatic planning should be introduced.

## Existing Page / Place data

Do not migrate or reinterpret saved Pages, cards, Groups, resume notes, sizes, tones, positions or launch flags unless explicitly required.

2.0 is primarily changing **presentation and navigation weight**, not destroying existing organization.

---

# 3. Current frontend choke points

## 3.1 `AppShell.tsx` is the orchestration choke point

`src/app/AppShell.tsx` currently owns:

- Dashboard state;
- active Page;
- editing state;
- navigation state;
- overlays;
- Page / Place rendering;
- widget summaries;
- Focus widget polling;
- Usage widget polling;
- settings rendering;
- card mutations;
- search;
- ingest;
- recovery shell.

This makes AppShell the correct place for **application-level transitions**, but it should not absorb every domain's data logic during 2.0.

Target:

> AppShell remains the application orchestrator, while domain workspaces keep their own domain data and rendering logic.

Do not rewrite AppShell from scratch.

Refactor only the boundaries needed for 2.0.

---

## 3.2 Navigation origin is Dashboard-centric

Current `ViewOrigin` assumes the user came from a Dashboard / Page and stores:

- page ID;
- search query / scope;
- scroll;
- editing state;
- optional Place information.

This works for:

```text
Page -> Place -> Note / Tool -> back
```

but is insufficient for the 2.0 flow:

```text
Today -> Place -> back to Today
```

Do not fake a Page origin when entering a Place from Today.

### Target navigation origin model

Introduce a union-style return target.

Conceptually:

```ts
type ViewOrigin =
  | DashboardOrigin
  | SystemWorkspaceOrigin;
```

Where `DashboardOrigin` preserves the existing Page / search / edit / Place restoration data, and `SystemWorkspaceOrigin` stores at least:

```text
workspaceId
scrollY
```

`returnToOrigin()` should restore the actual source context.

This is a prerequisite for a natural Today -> Place continuation path.

---

## 3.3 System workspace registry cannot currently participate in app orchestration

`featureRegistry.tsx` currently stores `render: () => ReactNode`.

That works for isolated workspaces such as Calendar / Activity, but Today now needs application-level capabilities:

- open Todo workspace;
- open a Place;
- enter Focus Mode after starting Focus;
- return to active Focus.

Do not give Today direct access to AppShell internals through imports or globals.

### Target registry role

Make the registry primarily **metadata**, for example:

```text
id
title
icon
navigation group / weight
search keywords
```

AppShell should orchestrate the actual render and pass the callbacks a workspace requires.

A four-workspace switch in AppShell is preferable to a pseudo-generic registry that hides cross-workspace behavior behind globals.

Expected first-class system workspaces:

```text
today
todo
calendar
activity
```

Focus Mode is not a normal system-workspace destination.

---

## 3.4 Todo is still coupled to a widget card

`TodoDialog` currently requires a `DashboardCard` widget.

The widget provides the initial / selected list through `widgetResourceId`, and switching lists can update widget preferences.

This prevents Todo from naturally becoming a first-class sidebar destination.

### Target Todo architecture

Split the concepts:

```text
Todo management UI
        ↑
  reusable core
   /          \
System Todo   legacy Todo widget adapter
```

Possible implementation shapes:

- extract a `TodoWorkspace` / `TodoManager` component from `TodoDialog`; or
- make the existing component accept an optional widget binding and move widget-specific synchronization behind optional callbacks.

Required outcome:

- Todo system workspace works without any Dashboard card;
- existing Todo widget can continue to bind a specific list;
- no Todo data migration is required.

Do not delete Todo widget support during the first architectural stage.

---

## 3.5 Focus has multiple frontend owners

Current Focus behavior is spread across:

- `TodayWorkspace`;
- `FocusDialog`;
- `WidgetCardPreview`;
- AppShell's Focus widget polling / actions.

This was acceptable while Focus was a widget / tool.

It is wrong for 2.0 because Focus becomes an **application state**.

### Target: one app-level Focus controller

Create a small controller hook / module owned by AppShell, conceptually:

```text
useFocusController

state
ready
refresh()
start(request)
pause()
resume()
stop(outcome)
```

Responsibilities:

- own the canonical frontend `FocusState` snapshot;
- initialize after persistence is ready;
- expose domain operations through `platform/focus`;
- detect state transitions needed by the presentation layer;
- provide the same Focus state to Today, Focus Mode and temporary compatibility surfaces.

It should **not** own Todo, Place, Calendar or Activity data.

### Important behavior

Polling / expiry refresh must not forcibly return the user to Focus Mode after they intentionally left the Focus screen.

Only these events should enter Focus Mode automatically:

1. startup finds an already running / paused Focus;
2. the user explicitly starts a Focus;
3. the user explicitly chooses `回到專注`.

This distinction is essential.

---

# 4. Target application state model

## Normal app route / view

Conceptually extend `AppView` to support Focus presentation without pretending it is another sidebar workspace.

Target shape:

```text
Dashboard(Page)
SystemWorkspace(Today / Todo / Calendar / Activity)
Place
Note
LegacyTool compatibility route
FocusMode
```

`FocusMode` represents presentation state.

The persisted Focus domain remains in SQLite.

### Focus route rule

```text
Focus domain active + view == FocusMode
    -> full subtractive Focus UI

Focus domain active + view != FocusMode
    -> normal app navigation is available
    -> Today shows compact "正在做 / 回到專注"
```

Leaving Focus Mode changes only the view.

It must not pause or stop Focus.

---

# 5. Startup routing

Current AppShell starts on the first Dashboard Page.

2.0 target:

```text
initialize workspace
       ↓
load Focus state
       ↓
active / paused Focus ?
   yes -> FocusMode
   no  -> Today
```

### Avoid route flicker where practical

Introduce a small startup-routing readiness state rather than rendering an arbitrary Page and immediately jumping to Today / Focus after initialization.

Do not block recovery rendering.

Recovery remains higher priority than normal startup routing.

### Browser demo

Browser demo behavior should receive an explicit default route so visual tests / manual demos remain deterministic.

---

# 6. Target Focus frontend architecture

## New Focus Mode component

Do **not** make the existing `FocusDialog` carry both legacy timer-tool responsibilities and the new application-state UI indefinitely.

Safer path:

```text
FocusDialog
  -> temporary legacy compatibility surface

FocusMode / FocusWorkspace
  -> new 2.0 application-state UI
```

After compatibility cleanup, old FocusDialog can be removed if nothing requires it.

### Context resolution

Create shared Focus context resolution logic outside Today.

Example conceptual module:

```text
features/focus/model.ts
```

Responsibilities:

- linked Todo ID -> Todo title / List / parent context;
- linked Group ID -> Place title / resume note;
- no link -> free Focus fallback.

Today and Focus Mode should not maintain separate copies of this logic.

### Data fetching

Do not move the entire Todo overview into AppShell solely for Focus context.

A Focus-specific hook/component can fetch the minimal Todo overview needed to resolve the linked Todo while receiving Dashboard cards from AppShell or loading them through the existing Dashboard API.

Prefer the smaller dependency surface.

### Completion transition without backend migration

When an active Focus expires, the backend resolves it to idle and clears current linked IDs.

The frontend can preserve a short-lived snapshot of the immediately preceding active Focus context before refresh.

That is enough to render the C completion transition while the app is open.

Do not add a schema migration merely to persist a transient completion screen.

If the app was closed when Focus completed, reopening directly to Today is acceptable.

---

# 7. Today architecture after refactor

Today should continue to own aggregation of:

- Calendar next-blocking information;
- Todo overview;
- continuation candidate;
- its local loading / error states.

Do not move all of those queries into AppShell.

### What Today should stop owning

Today should no longer be the final authority for application transitions.

It should receive callbacks / capabilities such as:

```text
onOpenTodo()
onCreateTodo()
onOpenPlace(groupId)
onStartFocus(request)
onReturnToFocus()
```

The exact prop names may vary.

### Focus controls in Today

Per B / C, Today should stop rendering pause / resume / stop controls for an active Focus.

It only needs the compact return state.

Therefore Today no longer needs to own the full Focus control workflow.

### Due / overdue

Preserve existing data selection semantics and tests.

Only presentation / action hierarchy changes:

```text
due / overdue -> 排到今天
planned -> 開始
```

Do not regress the 1.9 de-duplication behavior.

---

# 8. Place architecture

`GroupDetailView` already owns useful Place-specific behavior:

- resume note editing / autosave;
- launchable content;
- content grid;
- edit selection.

Preserve this.

### Add app-level Focus capability

Give Place a callback such as:

```text
onStartFocus()
```

AppShell provides the implementation:

```text
startFocus({
  phase: "focus",
  linkedTodoId: null,
  linkedGroupId: group.id
})
-> enter FocusMode
```

Keep `開啟工作環境` separate.

Do not combine launch + Focus into one implicit backend action.

### Organize mode

Remove the global sidebar `整理` entry.

Keep the existing editing machinery where possible, but expose it contextually from Page / Place headers.

This avoids rewriting pointer reorder / selection logic.

The first implementation should reuse the current `editing` state and mutation functions rather than inventing a new editing domain.

---

# 9. Page / Dashboard architecture

The Page system remains valid.

2.0 primarily changes normal-vs-organize presentation.

### Normal mode

Hide or remove from the normal card tree where appropriate:

- `kindLabel` (`LOCAL`, `WEB`, `APP`, `TOOL`);
- `card-glow`;
- redundant open arrow;
- administration affordances.

### Organize mode

Reuse current selection / reorder / inspector infrastructure.

Do not rewrite drag-and-drop simply because the visual language changes.

### Search

Unified Page / all-places search is useful and should remain.

Its placement can change visually, but avoid coupling the 2.0 navigation rewrite to a search-engine rewrite.

---

# 10. Legacy widget compatibility

This is a compatibility problem, not a reason to preserve the old product hierarchy.

Current persisted `WidgetKind` values are:

```text
todo
focus
usage
```

Do not destructively migrate existing cards merely to clean the UI.

## Todo widget

Keep.

It can become a quieter contextual List preview inside a Page / Place.

The Todo system workspace is independent from it.

## Focus widget

Deprecate new creation in the 2.0 UI.

Existing saved Focus widget cards should remain readable and non-crashing.

Preferred compatibility behavior:

- render as a quiet legacy shortcut / status surface;
- if Focus is active: `回到專注`;
- if Focus is idle: route to Today / Focus-start workflow rather than resurrecting the old full timer workspace.

Do not delete the card automatically.

## Usage widget

Deprecate new creation in the 2.0 UI, but **do not delete the underlying Usage subsystem**.

Important: the current Usage tool owns a distinct local foreground-App tracking system with:

- tracking enabled state;
- idle threshold;
- app exclusion;
- history deletion;
- local usage summary.

This is not the same source as ActivityWatch-backed Activity.

### Compatibility direction

Before removing the Usage widget as a primary entry point:

1. move / preserve its tracking and data-management controls under Settings or another explicit compatibility surface;
2. keep existing persisted Usage widget cards functional enough to reach that surface during migration;
3. do not silently merge Usage data into ActivityWatch data;
4. do not delete Usage history as part of the redesign.

A later product decision may retire the built-in tracker, but that is outside the 2.0 consolidation unless explicitly chosen.

## Backend compatibility

The Rust `create_widget` implementation may continue accepting legacy widget kinds during the 2.0 transition.

It is sufficient to remove Focus / Usage from the normal Add Panel UI first.

This preserves old backups / internal compatibility and avoids an unnecessary data migration.

---

# 11. Visual-system implementation architecture

`src/styles.css` is currently a large historical stylesheet containing:

- early hard-coded visual rules;
- semantic theme variables;
- later theme overrides;
- tool workspace styling;
- later quiet-workspace overrides;
- responsive rules for many domains.

Do not add a final `/* 2.0 */` override continent to the bottom.

### Migration strategy

Create a small CSS structure, conceptually:

```text
src/styles/
  tokens.css
  base.css
  shell.css
  today.css
  focus.css
  dashboard.css
  place.css
  todo.css
  support-workspaces.css
```

Exact filenames are not sacred.

The architectural rule is.

### Stage migration, not one-shot rewrite

1. extract semantic color / theme tokens with no visual behavior change;
2. add spacing / radius / type / layout-width tokens;
3. move one component area's rules at a time;
4. delete the corresponding old rules from `styles.css` as they move;
5. keep legacy CSS only for components not migrated yet;
6. remove `styles.css` or reduce it to a deliberate compatibility file at the end.

Do not duplicate the same selector in both new and old files for several stages without a tracked deletion plan.

### Existing color themes

Keep the five selectable themes.

Refactor their semantic role rather than deleting the feature.

Add tokens for concepts such as:

```text
text strong / primary / muted
app / sidebar / surface levels
border soft / strong
accent
warning / danger
spacing
radius
motion
content width
```

Accent theme choice should not change layout semantics.

---

# 12. Test architecture

The current repo has useful domain / component tests but weak app-shell integration coverage for the new 2.0 transitions.

Do not rely only on manual screenshots.

## Preserve existing tests

Especially preserve / adapt tests covering:

- Today planned / due / overdue separation;
- planning failure isolation;
- recurrence / Todo persistence;
- Focus start guard;
- Focus pause / resume / expiry;
- Place launch separation;
- navigation origin behavior;
- widget backup / persistence compatibility.

## Add transition tests

At minimum add tests for:

### Startup

```text
no active Focus -> Today
active Focus -> FocusMode
paused Focus -> FocusMode
```

### Today

```text
planned Todo Start -> linked Focus -> FocusMode
Place Start -> linked Focus -> FocusMode
active Focus + manually left -> compact return state
empty Today -> open Todo
```

### Focus Mode

```text
leave screen != stop Focus
pause / resume preserve linked context
end Focus -> transition / Today without completing Todo
sidebar absent in FocusMode
```

### Navigation origin

```text
Today -> Place -> back -> Today
Page -> Place -> back -> original Page state
```

### Legacy widget compatibility

```text
old focus widget does not crash
old usage widget does not lose data / management route
Todo widget remains list-bound
new Add UI no longer offers focus / usage widget creation
```

## Visual / responsive acceptance

Automated DOM tests are not sufficient for D.

Each relevant stage should also receive manual acceptance at:

```text
wide desktop
medium / narrow desktop window
keyboard navigation
Focus Mode
```

---

# 13. Recommended implementation stages

The stages below are ordered by dependency, not by visual excitement.

Humans naturally want to start with the shiny sidebar. Resist this.

---

## Stage 0 — Baseline and characterization guardrails

### Goal

Create a trustworthy pre-2.0 baseline before structural edits.

### Work

- run all existing tests / build / Rust validation;
- add missing characterization tests around AppView / origin behavior that Stage 1 will change;
- record current schema / backup versions;
- confirm existing focus / usage / todo widget cards survive current backup round-trip;
- no visible redesign.

### Expected files

Primarily tests and possibly small test helpers.

### Do not

- change product behavior;
- bump versions;
- change schema;
- restyle UI.

### Gate

All current behavior is green before refactor begins.

---

## Stage 1 — Navigation foundation + standalone Todo

### Goal

Remove the two architecture blockers that prevent B from being expressed cleanly.

### Work

1. generalize `ViewOrigin` so a contextual view can return to either Dashboard or system workspace;
2. make system-workspace registry metadata-first rather than self-rendering with no context;
3. extract / adapt Todo management UI so it can run without a widget card;
4. prepare `todo` as a first-class system workspace;
5. preserve legacy Todo widget adapter behavior;
6. add navigation and Todo standalone tests.

### Expected files

- `src/app/navigation.ts`
- `src/app/navigation.test.ts`
- `src/app/featureRegistry.tsx`
- `src/app/featureRegistry.test.tsx`
- `src/app/AppShell.tsx`
- `src/components/TodoDialog.tsx` and/or new `src/features/todo/*`
- Todo tests

### Visible behavior

Keep visual changes minimal.

Todo may become internally ready as a system workspace before the final sidebar layout is enabled.

### Gate

```text
Page -> Place -> back still works
Today/system workspace -> contextual route -> back can be represented correctly
Todo works with no Dashboard widget
legacy Todo widget still works
```

---

## Stage 2 — App-level Focus controller + Focus Mode state machine

### Goal

Make Focus an application state without yet performing the full visual redesign.

### Work

1. introduce app-level Focus controller;
2. add `FocusMode` AppView / presentation state;
3. implement startup restore logic;
4. create new Focus Mode component / context resolver;
5. implement leave-screen-without-stop behavior;
6. implement explicit return to Focus;
7. keep current backend contract unchanged;
8. keep old FocusDialog only as temporary compatibility code;
9. add state-transition tests.

### Expected files

- `src/app/AppShell.tsx`
- `src/app/navigation.ts`
- new `src/features/focus/*`
- `src/platform/focus.ts` only if a frontend type/export helper is needed
- Focus / App integration tests

### Rust

No Rust change expected.

If a Rust change becomes necessary, stop and justify it rather than casually changing persistence.

### Gate

```text
startup active Focus -> FocusMode
start -> FocusMode
leave -> Today while session still running
return -> same session
pause/resume/end work
Focus end does not complete Todo
```

---

## Stage 3 — Today 2.0 IA + startup home + sidebar information architecture

### Goal

Implement B on top of the stable navigation / Focus foundation.

### Work

1. Today becomes normal startup destination when Focus is inactive;
2. Today receives app-level callbacks instead of owning global navigation consequences;
3. planned Todo row gets one primary Start action;
4. due / overdue collapse into `需要留意` flow;
5. Calendar empty state disappears;
6. Calendar next event becomes compact constraint information;
7. empty Today gains gentle Todo entry actions;
8. continuation uses `上次做到` / `接著做` language;
9. active Focus becomes compact return state only;
10. introduce the resolved text-first sidebar grouping;
11. Todo becomes visible as a core sidebar destination;
12. Pages move under `我的空間` product hierarchy;
13. Calendar / Activity become support destinations;
14. remove global sidebar `整理` control.

### Expected files

- `src/features/today/TodayWorkspace.tsx`
- `src/features/today/TodayWorkspace.test.tsx`
- `src/app/AppShell.tsx`
- `src/app/featureRegistry.tsx`
- navigation / shell tests
- first new shell / Today CSS files

### Gate

B success criteria are manually and automatically testable.

---

## Stage 4 — Page / Place interaction cleanup + contextual organize mode

### Goal

Make Pages and Places behave like intentional spaces rather than administration dashboards.

### Work

1. add contextual `整理` entry to Page / Place headers;
2. reuse existing editing selection / reorder machinery;
3. hide administrative metadata in normal mode;
4. remove repeated kind labels in normal cards;
5. remove normal open arrow when whole tile is clickable;
6. remove card glow element / decorative emphasis;
7. quiet card sizes / density while preserving preview and spatial hierarchy;
8. prioritize Place title / continuation / work action;
9. add explicit Place Start Focus action using the app Focus controller;
10. keep Place launch and Focus separate.

### Expected files

- `src/app/AppShell.tsx`
- `src/components/GroupDetailView.tsx`
- Dashboard / card rendering helpers
- dashboard / place CSS modules
- related tests

### Gate

```text
normal Page has no maintenance clutter
organize mode retains drag/reorder/edit/delete capability
Place can start Focus without launching
Place can launch without starting Focus
```

---

## Stage 5 — Full visual-system migration

### Goal

Implement D consistently instead of as local component patches.

### Work

1. extract / normalize tokens;
2. migrate typography hierarchy;
3. migrate spacing / radius / surface hierarchy;
4. Today target width / whitespace;
5. Focus quiet centered composition;
6. Page / Place quieter surface treatment;
7. Todo shared visual language while keeping management density;
8. Calendar / Activity / Settings token migration;
9. responsive navigation behavior;
10. `prefers-reduced-motion` coverage;
11. delete migrated legacy CSS blocks rather than leaving duplicate overrides.

### Expected files

- `src/main.tsx` or a CSS index import
- new `src/styles/*`
- shrinking `src/styles.css`
- component markup only where required by hierarchy

### Gate

D's UI death / demotion ledger is auditable in code.

No major screen should still depend on the old "everything is a glowing card" language.

---

## Stage 6 — Legacy Focus / Usage widget bridge and Settings relocation

### Goal

Finish the old Dashboard-tool transition without destroying user data or hiding controls.

### Work

1. remove Focus / Usage from Add Panel widget creation UI;
2. keep Todo widget creation;
3. convert existing Focus widget rendering into a quiet compatibility shortcut;
4. convert existing Usage widget rendering into a quiet compatibility / management shortcut;
5. relocate built-in Usage tracking and data-management controls to Settings or an explicit compatibility detail surface;
6. preserve Usage history;
7. preserve backend / backup ability to load legacy widget cards;
8. remove obsolete old full Focus tool UI only when no supported route still depends on it;
9. remove obsolete widget polling from AppShell once compatibility surfaces no longer require it.

### Expected files

- `src/components/AddPanel.tsx`
- `src/components/WidgetCardPreview.tsx`
- `src/components/UsageDialog.tsx` or extracted settings component
- `src/components/FocusDialog.tsx` / `FocusDialogSafe.tsx` cleanup
- `src/app/AppShell.tsx`
- widget tests

### Gate

```text
existing focus widget data/card survives
existing usage widget data/card survives
usage tracking settings remain reachable
new UI cannot create new focus/usage widgets
Todo widget remains supported
```

---

## Stage 7 — Consolidation cleanup + complete acceptance

### Goal

Remove temporary bridge code and validate the whole 2.0 product flow.

### Work

- remove unreachable compatibility branches that are no longer needed;
- remove dead CSS / selectors;
- remove duplicate Focus polling;
- review AppShell size / responsibilities after the migration and extract only obvious stable helpers;
- update onboarding / README language to final 2.0 product narrative;
- full test / build / Rust validation;
- manual acceptance against A / B / C / D;
- only then perform version / release work.

### Validation baseline

At minimum:

```bash
pnpm test
pnpm build
cargo test
cargo clippy -- -D warnings
cargo fmt --check
git diff --check
pnpm tauri dev
```

Manual smoke should cover:

```text
fresh / empty Today
planned Today
Today with due + overdue
Today with Calendar event
Today -> Todo
Today -> Place -> back
Today Todo -> Focus
Today Place -> Focus
Place -> Focus
Focus pause / resume
Focus leave / return
Focus completion
Page normal / organize
Place normal / organize
legacy Todo widget
legacy Focus widget
legacy Usage widget / tracking settings
Calendar
Activity
Settings
backup export / inspect / restore smoke
narrow window
keyboard navigation
```

---

# 14. Stage dependency graph

```text
Stage 0  baseline
   │
   ▼
Stage 1  navigation + standalone Todo
   │
   ▼
Stage 2  app-level Focus state
   │
   ▼
Stage 3  Today + startup + sidebar IA
   │
   ▼
Stage 4  Page / Place interaction cleanup
   │
   ▼
Stage 5  visual-system migration
   │
   ▼
Stage 6  legacy widget bridge / Usage relocation
   │
   ▼
Stage 7  cleanup + acceptance + release prep
```

Some CSS token extraction from Stage 5 may begin earlier if it is mechanically necessary, but do not allow visual redesign work to outrun the navigation / Focus state foundation.

---

# 15. What should not be combined into one Luna task

Do not combine all of these in one implementation run:

- navigation-origin refactor;
- Todo decoupling;
- new Focus state machine;
- Today redesign;
- sidebar redesign;
- Page card redesign;
- CSS architecture migration;
- widget deprecation;
- release.

That would create too many simultaneous failure dimensions and destroy useful review checkpoints.

The whole reason for the Sol -> Luna workflow is to avoid this exact species of heroic software-development accident.

---

# 16. Recommended Sol -> Luna control loop

For each stage:

```text
Sol
  inspect current remote state
  define exact contracts / files / non-goals
  produce one bounded CODEX HANDOFF
        ↓
Luna
  inspect local working tree
  implement
  test
  report changed files / deviations / risks
        ↓
Sol
  review report + Git diff / pushed commit
  compare against stage acceptance
        ↓
next stage
```

Do not write the next handoff until the previous stage is accepted or its deviations are intentionally folded into the architecture.

---

# 17. Architecture invariants for every implementation handoff

Every stage must preserve unless that stage explicitly changes it:

1. **Today owns orchestration, not other domains' persistence.**
2. **Todo `plannedFor` remains explicit intent and independent of `dueAt`.**
3. **Focus is the only active-work state; do not create a second competing "current task" store.**
4. **Focus ending does not complete Todo.**
5. **Place launching and Place Focus remain separate explicit actions.**
6. **Activity remains retrospective and non-judgmental.**
7. **No schema / backup bump without a persistent-data reason.**
8. **No destructive legacy-widget migration during UI consolidation.**
9. **Normal Page browsing and organize mode remain distinct.**
10. **Focus Mode removes alternatives rather than adding another dashboard.**
11. **Existing backup / recovery behavior must remain usable.**
12. **Accessibility and keyboard behavior may not be sacrificed for visual minimalism.**

---

# 18. Main implementation risks

## Risk A — AppShell becomes even larger

Mitigation:

- keep AppShell responsible for orchestration only;
- extract Focus controller / Focus context model;
- keep Today domain queries in Today;
- keep Todo domain UI in Todo;
- do not use 2.0 as an excuse for an unrelated full AppShell rewrite.

## Risk B — Focus polling fights navigation

Mitigation:

- Focus domain state and FocusMode visibility are separate concepts;
- polling updates domain state only;
- user's explicit `leave Focus screen` must be respected.

## Risk C — Today -> Place back behavior regresses Page navigation

Mitigation:

- generalize origin as a union;
- retain existing Dashboard-origin restoration as one branch;
- add tests before changing navigation.

## Risk D — Todo standalone refactor breaks list-bound Todo widgets

Mitigation:

- extract shared core;
- keep widget binding as an adapter;
- test standalone + widget-bound paths independently.

## Risk E — Usage widget removal strands privacy / tracking controls

Mitigation:

- relocate controls before removing the old primary entry;
- never equate built-in Usage data with ActivityWatch data;
- preserve history.

## Risk F — CSS rewrite causes broad regressions

Mitigation:

- migrate component areas incrementally;
- delete old blocks as they move;
- retain semantic theme variables;
- perform visual acceptance after every affected stage.

---

# 19. Architecture review verdict

Personal Place 2.0 does **not** need a backend rewrite.

It needs a frontend hierarchy correction.

The decisive architecture moves are:

```text
Dashboard-centric navigation
        -> workflow-aware navigation

widget-owned Todo
        -> core Todo workspace + optional widget adapter

multiple Focus owners
        -> one app-level Focus controller

Focus timer workspace
        -> Focus presentation state

global organize control
        -> contextual Page / Place mode

monolithic visual overrides
        -> staged semantic design-system migration

legacy widget deletion
        -> compatibility bridges, then cleanup
```

Once these foundations are in place, A / B / C / D can be implemented without corrupting the existing domain model.

---

# 20. Next action

The next action is **not** another architecture document.

Produce the **Stage 0 / Stage 1 Luna handoff**, beginning with characterization guardrails and the navigation / standalone-Todo foundation.

Do not hand Luna Stages 2–7 at the same time.
