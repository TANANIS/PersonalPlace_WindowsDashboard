# Personal Place Product TODO

> Current product / implementation handoff for Personal Place 2.0.
>
> Read this before proposing the next 2.0 implementation stage. The purpose of this document is to preserve accepted product decisions, implementation state, invariants, known technical debt, and the next bounded stage.

---

## Current status

Personal Place 2.0 product consolidation has completed its product-definition, Today / Focus restructuring, Page / Place interaction cleanup, and Stage 5 visual-system migration + runtime recovery.

```text
A — Product narrative                         RESOLVED
B — Today / Home IA                           RESOLVED
C — Real Focus Mode                           RESOLVED
D — Visual system + UI deletion               RESOLVED
Implementation architecture review            COMPLETE

Stage 0 — baseline characterization           ACCEPTED
Stage 1 — navigation + standalone Todo         ACCEPTED
Stage 2 — app-level Focus + FocusMode          ACCEPTED
Stage 2 acceptance cleanup                    ACCEPTED
Stage 3 — Today home + startup + sidebar IA    ACCEPTED
Stage 3 acceptance cleanup                    ACCEPTED
Stage 4 — Page / Place browse-vs-organize      ACCEPTED
Stage 5 — visual-system migration              ACCEPTED
Stage 5 runtime recovery                      ACCEPTED

NEXT: Stage 6 — legacy Focus / Usage widget bridge
```

Current accepted implementation checkpoint:

```text
85d31ab6cdeea606f012e922eca728bc1bc97e6b
fix: quiet dashboard header controls
```

Release packaging after the accepted Stage 5 implementation:

```text
504e1863e3378e9cfba10a72b64afff03d48c78f
release: publish Personal Place 1.9.1
```

`504e186` is a release / versioning checkpoint. Use `85d31ab` as the Stage 5 product implementation checkpoint when reasoning about later implementation history.

Persistence remains intentionally unchanged:

```text
SQLite schema version: 6
Backup format version: 4
Migration added for 2.0 so far: no
```

The last explicitly recorded automated gate before the final runtime-recovery series was:

```text
pnpm test: 37 files / 129 tests passed
pnpm build: passed
cargo test: 91 passed / 1 ignored
cargo clippy -- -D warnings: passed
cargo fmt --check: passed
git diff --check: passed
```

Stage 5 also required real desktop runtime review because automated tests did not detect CSS / layout regressions. The recovery was iterated directly against the runtime and then published as 1.9.1.

Do not treat green unit tests alone as sufficient evidence for future visual acceptance.

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

These contracts are accepted and must survive Stages 6–7.

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

Do not reconstruct resolved design decisions from conversation history when these documents already exist.

## A + B — Product narrative / Today IA

This TODO contains the concise accepted summary.

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

D remains the visual contract through Stage 7.

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

Baseline tests / contracts were established before restructuring.

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

Generic initialization failures have a visible retryable startup error path. Database recovery remains higher priority.

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

System workspace registry is metadata-first.

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

Page exposes contextual:

```text
整理
完成整理
```

Existing editing / selection / reorder / ContextActionBar machinery was reused rather than rewritten.

Normal Page cards no longer render the old dashboard-only affordances:

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

Legacy Todo / Focus / Usage widgets remained compatible for later Stage 6 handling.

---

## Stage 5 — Visual-system migration + runtime recovery — ACCEPTED

Initial migration:

```text
c8152de feat: migrate Personal Place 2.0 visual system
```

Structural acceptance cleanup:

```text
5002491 fix: restore Stage 5 structural CSS behavior
9720adf fix: complete Stage 5 acceptance styling
```

The first migration passed automated tests but removed too many feature-specific structural CSS contracts together with the old decoration. Real runtime use exposed regressions that automated tests did not detect.

Runtime recovery then proceeded as a direct diagnose → implement → inspect loop:

```text
b13fab6 fix: recover Stage 5 runtime component contracts
4a69f30 fix: finish Stage 5 visual contracts
cbc70e5 fix: polish remaining Stage 5 layouts
85d31ab fix: quiet dashboard header controls
```

Release packaging:

```text
504e186 release: publish Personal Place 1.9.1
```

### Stage 5 delivered visual direction

The product now consistently targets:

```text
Focus     → quietest, one chosen work context, almost no navigation
Today     → calm and directional
Page      → wider intentional personal space
Place     → work context + continuation
Todo      → denser management workspace
Calendar  → structured supporting tool
Activity  → neutral retrospective review
Settings  → denser practical configuration workspace
```

Core Stage 5 rules retained:

- one screen, one focal point;
- neutral surfaces dominate;
- accent color is semantic rather than decorative;
- typography / spacing / omission before another card;
- no decorative card glow / bloom / old icon rail;
- short functional motion with reduced-motion support;
- Focus remains the quietest state;
- normal Page browsing remains distinct from organize mode;
- desktop navigation remains text-first;
- narrow navigation remains a temporary drawer.

### Runtime recovery outcomes

The recovery explicitly restored or refined contracts for:

- desktop shell / sidebar structure;
- Page card grid and mixed card subtypes;
- Page icons and Page manager layout;
- organize-mode selection / drag surfaces;
- Place structure;
- Todo list / inspector / subtask / editor structure;
- Calendar empty/detail layouts;
- Activity hierarchy / timeline;
- Settings / Calendar-source / backup / recovery layouts;
- legacy Todo / Focus / Usage widget previews;
- search behavior and Page header attention balance;
- five color themes and theme-specific neutral surface atmosphere;
- responsive layout paths.

### Stage 5 important lesson

Do not use automated tests as a substitute for runtime visual acceptance.

The failed acceptance attempt demonstrated that CSS migrations can preserve DOM behavior and test output while breaking actual layout, theme application, content policies, and management surfaces.

For future visual stages, prefer:

```text
component contract inventory
→ behavioral baseline
→ implementation
→ actual runtime review
→ automated validation
→ accepted checkpoint
```

### Stage 5 known technical debt — NOT A BLOCKER

`src/styles/stage5-recovery.css` is intentionally loaded after the subsystem styles and currently acts as a runtime recovery / override layer.

This was acceptable to stabilize Stage 5 and publish 1.9.1, but it should **not** become permanent architecture.

Stage 7 should fold its rules back into their real owners where practical:

```text
Page / cards        → dashboard.css
Todo                → todo.css
Calendar / Activity
/ Settings           → support-workspaces.css
Theme surfaces       → tokens.css
true compatibility   → styles.css or explicit compatibility layer
```

Then remove or materially shrink `stage5-recovery.css`.

Do not reopen Stage 5 solely to perform this stylesheet consolidation.

---

# NEXT — Stage 6: Legacy Focus / Usage widget bridge

Stage 6 is the next product implementation task.

The goal is to remove duplicate legacy product surfaces without deleting persisted user data or changing the canonical Focus / Activity architecture.

Expected direction:

- stop offering new legacy Focus / Usage widgets in the normal Add flow;
- keep Todo widget creation available;
- preserve existing persisted Focus / Usage cards safely;
- convert existing Focus / Usage cards into quiet compatibility shortcuts / bridges where appropriate;
- keep old cards non-crashing and understandable;
- relocate any still-needed Usage tracking / data controls before deprecating its normal widget surface;
- keep built-in Usage distinct from ActivityWatch / Activity;
- do not delete user data;
- remove old full Focus presentation only where canonical app-level Focus already safely replaces it;
- avoid unnecessary widget polling after compatibility paths are simplified.

Canonical detail lives in D + implementation architecture.

### Stage 6 must NOT

Do not:

- change schema / backup format without a genuine persistent-data requirement;
- delete persisted legacy widget data;
- merge Usage and ActivityWatch semantics;
- alter `plannedFor` / `dueAt` meaning;
- change Focus completion semantics;
- launch Place work environments merely by starting Focus;
- perform the Stage 7 CSS consolidation early unless a Stage 6 change genuinely requires a tiny local cleanup;
- add unrelated product features.

---

# Stage 7 — Consolidation cleanup + final 2.0 acceptance — PENDING

Stage 7 should close the consolidation program rather than add product scope.

Required work:

- remove obsolete compatibility / bridge paths made unnecessary by Stages 0–6;
- fold `stage5-recovery.css` rules back into stable subsystem ownership and remove / shrink the recovery layer;
- clean remaining dead CSS / obsolete selectors;
- run final A / B / C / D acceptance review;
- run full automated validation;
- perform real desktop runtime smoke across representative data;
- verify all five themes;
- verify wide / medium / narrow layouts;
- verify keyboard / focus-visible / reduced-motion / forced-colors sanity;
- verify Focus Todo / Focus Place / completion states manually;
- inspect backup / recovery;
- verify no hidden 1.9 Dashboard-first assumptions remain;
- only then prepare the actual 2.0 version / release work.

Do not publish 2.0 before Stage 7 acceptance.

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
3. Read the Stage 6 section of [`PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md`](PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md).
4. Inspect current `master`, using `85d31ab` as the accepted Stage 5 implementation checkpoint and `504e186` as the 1.9.1 release packaging checkpoint.
5. Confirm no unrelated local / remote changes.
6. Produce a bounded **Stage 6 Sol → Luna handoff**.
7. Review Luna's actual GitHub diff before accepting Stage 6.
8. Keep the Stage 5 recovery lesson: runtime-dependent visual work requires actual runtime review.
9. Do not restart A / B / C / D design unless implementation reveals a genuine contradiction.

The next task is **Stage 6 legacy Focus / Usage widget bridge**, not another Stage 5 visual pass.
