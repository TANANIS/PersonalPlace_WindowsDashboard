# Personal Place Product TODO

> Current product / implementation handoff for Personal Place 2.0.
>
> Read this before proposing the next 2.0 implementation stage. The purpose of this document is to preserve the product decisions, accepted implementation state, invariants, and next work so a new planning conversation does not restart from v1.9 assumptions.

---

## Current status

Personal Place 2.0 product consolidation is well underway.

```text
A — Product narrative                RESOLVED
B — Today / Home IA                  RESOLVED
C — Real Focus Mode                  RESOLVED
D — Visual system + UI deletion      RESOLVED
Implementation architecture review   COMPLETE

Stage 0 — baseline characterization                  ACCEPTED
Stage 1 — navigation foundation + standalone Todo    ACCEPTED
Stage 2 — app-level Focus + FocusMode                 ACCEPTED
Stage 2 acceptance cleanup                           ACCEPTED
Stage 3 — Today home + startup + sidebar IA           ACCEPTED
Stage 3 acceptance cleanup                           ACCEPTED
Stage 4 — Page / Place browse-vs-organize cleanup     ACCEPTED

NEXT: Stage 5 — visual-system migration
```

Current accepted implementation checkpoint:

```text
0c943108664e0a6278f23bee2af9aa8f49e03d1a
feat: separate Personal Place browsing from organizing
```

Persistence remains intentionally unchanged:

```text
SQLite schema version: 6
Backup format version: 4
Migration added for 2.0 so far: no
```

Latest accepted validation baseline after Stage 4:

```text
pnpm test: 37 files / 129 tests passed
pnpm build: passed
cargo test: 91 passed / 1 ignored
cargo clippy -- -D warnings: passed
cargo fmt --check: passed
git diff --check: passed
```

Stage 4 desktop smoke was limited because port `1420` was already occupied by an existing Vite server. The existing process was not terminated automatically.

---

# Product definition

## Product promise

> **Personal Place is a local-first personal workspace that helps you decide what to do today, continue from where you left off, and start focusing.**

Internal shorthand:

> **Know what to do today, continue from where you stopped, then begin.**

Primary job:

> **Reduce the activation cost between intending to work and actually starting.**

Personal Place is not primarily a launcher, Todo app, timer, dashboard, Calendar companion, or activity tracker even though it contains those capabilities.

The product should help the user move through one coherent flow:

```text
What do I need to handle?
        ↓
What am I doing today?
        ↓
Where do I continue from?
        ↓
Start focusing
        ↓
Review what actually happened
```

---

## User-facing domain meanings

| Domain | User-facing meaning |
| --- | --- |
| **Today** | 我現在該做什麼 |
| **Todo** | 別讓我要做的事情消失 |
| **Place** | 把一件工作的東西和進度留在原地，下次直接接著做 |
| **Focus** | 我已經決定了，現在只做這件事 |
| **Calendar** | 別讓固定行程撞到我的安排 |
| **Activity** | 我最後實際把時間花到哪裡 |
| **Page** | 東西變多後才需要的整理分區 |

Page remains useful but is not a core onboarding concept.

Place remains strategically important because it preserves a working scene:

```text
Tools / files / links used for one activity
+
where I stopped last time
=
return to the same working context
```

Focus is an application state, not merely a timer.

Today asks:

> What should I do?

Focus says:

> I already chose. Stop showing me alternatives.

---

# Product character

Target interaction / visual character:

> **Calm, private, low-pressure, directed, non-judgmental — like returning to your own work desk.**

Meaning:

- **calm** does not mean directionless;
- **directed** means the next useful action should be obvious;
- **low-pressure** means empty days / overdue work should not become alarm walls;
- **non-judgmental** means no productivity score, streak pressure, shame language, or intrusive performance feedback;
- **private** means the product should feel like the user's own workspace, not a corporate performance dashboard.

---

# Core product principles

1. **The job is reducing start cost, not managing information.**
2. **Today is the product entry point.**
3. **Users should receive value before being asked to organize.**
4. **Place sells continuation of a working scene, not grouping.**
5. **Focus is a subtractive state, not merely a timer.**
6. **The product provides direction without judging the user.**
7. **Every visible element spends attention. Spend it only on deciding, continuing, working, or intentional review.**

---

# Architecture / domain invariants

These contracts are already established and must survive Stages 5–7.

```text
plannedFor != dueAt

Focus ended != Todo completed

starting Focus != launching Place

starting Place Focus != launching Place work environment

starting Todo Focus does not mutate plannedFor

Activity = retrospective, not productivity scoring

Today = orchestration, not a new persistence domain

Focus domain active != FocusMode necessarily visible

Page normal browsing != organize mode

schema / backup version do not change without a genuine persistent-data requirement
```

Also preserve:

- local-first Tauri / SQLite ownership;
- Page / Place / card data and positions;
- tones / sizes / `resumeNote` / launch flags;
- legacy widget data until the Stage 6 compatibility path is complete;
- backup / recovery behavior;
- keyboard and accessibility behavior.

---

# Canonical design documents

Use these instead of reconstructing resolved design decisions from conversation history.

## A + B — Product narrative / Today IA

This document now contains the concise accepted summary.

Important resolved B rules:

```text
startup active / paused Focus → FocusMode
startup idle → Today

Today is the default home
Pages are intentional destinations

plannedFor == today → primary Today plan
Due / overdue → attention inputs, not automatic plan
Calendar → compact time constraint
Place continuation → 接著做 / 上次做到
```

## C — Focus Mode

See [`PRODUCT_2_0_C_FOCUS_MODE.md`](PRODUCT_2_0_C_FOCUS_MODE.md).

Core rule:

> **When the user has already decided what to do, the interface should safely stop offering alternatives.**

## D — Visual system

See [`PRODUCT_2_0_D_VISUAL_SYSTEM.md`](PRODUCT_2_0_D_VISUAL_SYSTEM.md).

Core rule:

> **Use typography, spacing and omission before using another card, border, badge, glow or color block.**

D is the primary design contract for Stage 5.

## Implementation architecture

See [`PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md`](PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md).

It defines:

- AppShell orchestration boundaries;
- navigation / origin behavior;
- standalone Todo architecture;
- app-level Focus controller;
- Today-to-AppShell boundary;
- Place Focus / launch separation;
- legacy widget compatibility strategy;
- Usage vs ActivityWatch distinction;
- staged implementation order;
- validation gates.

---

# Accepted implementation progress

## Stage 0 — Baseline characterization — ACCEPTED

Baseline tests / contracts established before restructuring.

No product-domain rewrite.

---

## Stage 1 — Navigation foundation + standalone Todo — ACCEPTED

Checkpoint:

```text
bfaabed feat: prepare Personal Place 2.0 navigation and standalone todo
```

Delivered:

- navigation origin can represent Dashboard or `systemWorkspace` cleanly;
- nested Place navigation can return to a system workspace;
- Todo became a first-class system workspace;
- standalone Todo no longer requires Dashboard widget persistence;
- legacy Todo widget uses a narrow adapter;
- no schema / backup changes.

Important accepted navigation contract:

```text
Today → Place → Back → Today
Page → Place → Back → original Page
```

---

## Stage 2 — App-level Focus controller + FocusMode — ACCEPTED

Implementation checkpoint:

```text
0e8b998 feat: add app-level focus mode controller
```

Acceptance cleanup:

```text
736f5dc fix: harden Personal Place 2.0 focus state ownership
```

Delivered:

- one canonical app-level frontend Focus controller in normal AppShell runtime;
- `FocusMode` is a real application presentation state;
- sidebar disappears in FocusMode;
- Todo / Place Focus context is resolved centrally;
- user can leave FocusMode without stopping Focus;
- later Focus polling does not force the user back into FocusMode;
- Today shows only compact `回到專注` while Focus is active;
- Place Focus and work-environment launch remain separate;
- legacy Focus surfaces use the canonical controller;
- completion snapshot remains in-memory, no schema change.

Cleanup fixed:

- hidden second Today Focus controller;
- controlled FocusDialog settings draft regression;
- controller / Today / FocusMode regression coverage.

---

## Stage 3 — Today home + startup + sidebar IA — ACCEPTED

Implementation checkpoint:

```text
b09eac9 feat: make Today the Personal Place 2.0 home
```

Acceptance cleanup:

```text
ee04e84 fix: harden Personal Place 2.0 startup routing
4afdecc test: cover origin-aware Place back labels
```

Delivered startup behavior:

```text
workspace persistence ready
        ↓
canonical Focus ready
        ↓
running / paused → FocusMode
idle → Today
```

Startup routing is a one-time decision. Later Focus polling cannot hijack navigation after the user intentionally leaves FocusMode.

Generic initialization failures now have a visible retryable startup error path. Database recovery remains higher priority.

Delivered Today 2.0 IA:

- planned work is primary;
- empty Today gives `從待辦選一件` / `新增待辦`;
- Calendar absence renders nothing;
- useful Calendar event is a compact constraint;
- Due / overdue collapse into `需要留意`;
- attention items use `排到今天`, not Start;
- continuation uses `接著做` / `上次做到`;
- `接著做` enters Place instead of auto-launching it;
- active Focus on Today remains return-only.

Delivered sidebar hierarchy:

```text
Today
Todo

我的空間
  Pages

Calendar
Activity

Settings
```

The global `整理` navigation entry was removed.

System workspace registry is now metadata-first.

---

## Stage 4 — Page / Place browse vs organize — ACCEPTED

Checkpoint:

```text
0c94310 feat: separate Personal Place browsing from organizing
```

Delivered Page behavior:

```text
NORMAL PAGE
→ content / entry points

ORGANIZE PAGE
→ select / reorder / edit / resize / move / group / delete
```

Page now exposes contextual:

```text
整理
完成整理
```

Existing editing / selection / reorder / ContextActionBar machinery was reused rather than rewritten.

Normal Page cards no longer render:

```text
kind-label
card-glow
open-indicator
```

Whole-card opening remains semantic / keyboard accessible.

Page definitions remain managed separately through:

```text
我的空間 → 管理
```

Delivered Place hierarchy:

```text
Place title

上次做到
<resumeNote>

開始專注
開啟這個地方
整理

內容
```

Normal Place no longer leads with old dashboard metadata such as:

```text
YOUR PLACE
CONTENTS
item count / recent-use metadata
```

`resumeNote` persistence behavior remains unchanged:

- visible continuation content;
- edit on demand;
- 500ms autosave;
- flush before Back;
- save failure preserves draft.

Focus / launch separation has explicit regression coverage:

```text
開始專注 → onStartFocus only
開啟這個地方 → onLaunch only
```

Legacy Todo / Focus / Usage widgets remain compatible for later Stage 6 handling.

### Stage 4 known non-blockers

- interactive Tauri smoke was limited because port `1420` was already occupied;
- `src/styles/dashboard.css` currently contains a likely dead selector:

```css
.launcher-grid.is-editing .organize-button
```

because the organize button lives in the topbar rather than inside `.launcher-grid`.

Do not create a special cleanup stage only for this selector; clean it during Stage 5 CSS consolidation.

---

# NEXT — Stage 5: visual-system migration

Stage 5 is now the next implementation task.

This is not another product-architecture redesign.

The product flow and interaction hierarchy are already established.

Stage 5 should make the accepted 2.0 architecture consistently look and feel like one product.

Primary scope from D:

```text
typography
spacing
surface hierarchy
radius hierarchy
neutral / accent usage
primary / secondary / destructive actions
hover / focus / motion behavior
responsive navigation
CSS consolidation
accessibility visual states
```

### Visual energy hierarchy

```text
Focus     → quietest, one chosen work context, almost no navigation
Today     → calm and directional
Page      → wider intentional personal space
Place     → work context + continuation
Todo      → denser management workspace
Calendar  → structured tool
Activity  → retrospective review
Settings  → denser configuration workspace
```

### D rules Stage 5 must enforce

- one screen, one focal point;
- neutral surfaces dominate;
- accent color is semantic, not decorative;
- avoid nested bordered rectangles;
- use typography / spacing before another card;
- remove remaining decorative glow / bloom / excessive gradients;
- avoid huge hover elevation;
- radius should communicate role rather than making everything equally rounded;
- one primary action per local decision;
- motion should be short and functional;
- respect `prefers-reduced-motion`;
- Focus must remain the quietest state;
- responsive behavior must not collapse back into the old dense icon-rail identity.

### Stage 5 must NOT

Do not:

- change product domain semantics;
- change startup routing;
- redesign Today IA again;
- merge Focus and launch;
- change schema / backup;
- remove legacy Focus / Usage widgets yet;
- turn visual cleanup into an AppShell rewrite.

---

# Stage 6 — Legacy Focus / Usage widget bridge — PENDING

After visual migration, handle legacy widget duplication and compatibility deliberately.

Expected direction:

- stop offering new legacy Focus / Usage widgets in normal add flow;
- preserve existing persisted cards safely;
- keep old cards non-crashing;
- relocate any still-needed Usage controls before deprecating its normal widget surface;
- keep built-in Usage distinct from ActivityWatch / Activity;
- do not delete user data.

Canonical detail lives in D + implementation architecture.

---

# Stage 7 — Consolidation cleanup + final acceptance + release prep — PENDING

Final stage should:

- remove obsolete compatibility / CSS paths made unnecessary by Stages 0–6;
- run final A / B / C / D acceptance review;
- run full validation / desktop smoke;
- inspect backup / recovery / accessibility / responsive behavior;
- verify no hidden 1.9 Dashboard-first assumptions remain;
- only then prepare 2.0 version / release work.

Do not bump the version or publish 2.0 before Stage 7 acceptance.

---

# Explicit non-goals before 2.0 acceptance

Do not use new features to hide consolidation work.

Avoid prioritizing:

- AI task recommendations;
- productivity scores;
- streaks / gamification;
- automatic prioritization;
- additional dashboard widgets;
- new Calendar integrations;
- cloud sync / accounts;
- more Activity metrics;
- more launcher features;
- additional planning fields;
- complex automation.

These may be considered after the core product is coherent.

---

# Current success criteria

A final 2.0 should make these statements true:

- A new user can explain what Personal Place does after using it briefly.
- Today is obviously where work begins.
- The user receives value before understanding every domain.
- Planning and Focus feel like one continuous workflow.
- Place provides obvious continuation value.
- Focus visibly removes alternatives.
- Page browsing does not look like administration.
- Organize controls appear only when the user intentionally organizes.
- Primary and secondary information are immediately distinguishable.
- The interface feels calmer and more intentional than v1.9.0.
- The interface feels private and non-judgmental.
- No new feature is required to achieve the core 2.0 improvement.

---

# New-conversation continuation checklist

When continuing 2.0 work in a fresh conversation:

1. Read this `TODO.md` first.
2. Read [`PRODUCT_2_0_D_VISUAL_SYSTEM.md`](PRODUCT_2_0_D_VISUAL_SYSTEM.md).
3. Read the Stage 5 section of [`PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md`](PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md).
4. Inspect current `master` starting from accepted checkpoint `0c94310` (or newer if this TODO itself has been committed afterward).
5. Confirm no unrelated local / remote changes.
6. Produce a bounded **Stage 5 Sol → Luna handoff**.
7. Review Luna's actual GitHub diff before accepting Stage 5.
8. Do not restart A / B / C / D design unless implementation reveals a genuine contradiction.

The next task is **Stage 5 visual-system migration**, not another product-definition pass.
