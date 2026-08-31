# Personal Place 2.0 Design Index

> Canonical entry point for the 2.0 product consolidation work.

## Status

```text
A — Product narrative                RESOLVED
B — Today / Home IA                  RESOLVED
C — Real Focus Mode                  RESOLVED
D — Visual system + UI deletion      RESOLVED
Implementation architecture review   COMPLETE

Next:
Stage 0 / Stage 1 Sol → Luna handoff
→ staged implementation
→ validation after every stage
→ final 2.0 acceptance against A / B / C / D
```

## Sources

### A + B

See [`TODO.md`](TODO.md).

A resolves:

- product promise;
- primary job;
- first-use / returning-use loops;
- user-facing domain meanings;
- product character.

B resolves:

- Today as default entry;
- sidebar hierarchy;
- planned / empty / active-Focus Today states;
- Calendar as time constraint;
- due / overdue as attention inputs;
- Place continuation language;
- Page as intentional personal space.

### C

See [`PRODUCT_2_0_C_FOCUS_MODE.md`](PRODUCT_2_0_C_FOCUS_MODE.md).

C resolves Focus as a subtractive application state rather than a generic timer workspace.

### D

See [`PRODUCT_2_0_D_VISUAL_SYSTEM.md`](PRODUCT_2_0_D_VISUAL_SYSTEM.md).

D resolves:

- visual hierarchy;
- typography / spacing / surfaces / color / motion principles;
- text-first sidebar direction;
- Today / Focus / Page / Place / Todo visual targets;
- UI deletion / demotion ledger;
- legacy Focus / Usage widget direction;
- responsive / accessibility contract.

### Implementation architecture

See [`PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md`](PRODUCT_2_0_IMPLEMENTATION_ARCHITECTURE.md).

The architecture review resolves:

- navigation / return-origin changes;
- standalone Todo workspace architecture;
- app-level Focus controller and FocusMode presentation state;
- Today-to-AppShell orchestration boundary;
- Place Focus / launch separation;
- legacy widget compatibility strategy;
- built-in Usage vs ActivityWatch distinction;
- staged CSS / design-system migration;
- implementation stage dependency order;
- per-stage validation gates.

The core 2.0 plan remains schema-neutral unless implementation discovers a genuine new persistent-data requirement.

## Product test

> **Personal Place is a local-first personal workspace that helps you decide what to do today, continue from where you left off, and start focusing.**

Internal shorthand:

> **Know what to do today, continue from where you stopped, then begin.**

Visual / interaction character:

> **Calm, private, low-pressure, directed, non-judgmental — like returning to your own work desk.**

## Implementation order

```text
Stage 0 — baseline / characterization guardrails
Stage 1 — navigation foundation + standalone Todo
Stage 2 — app-level Focus controller + Focus Mode
Stage 3 — Today 2.0 + startup + sidebar IA
Stage 4 — Page / Place interaction cleanup
Stage 5 — visual-system migration
Stage 6 — legacy Focus / Usage widget bridge
Stage 7 — cleanup + complete acceptance + release prep
```

## Next rule

Do not ask Luna to generally "implement 2.0", "redesign the app", or consume Stages 0–7 in one implementation run.

The next Sol task is to produce one bounded Stage 0 / Stage 1 handoff, then review its result before authoring Stage 2.