# Personal Place Product TODO

> Read this before proposing the next feature release.
>
> This document exists to preserve the product-level problems discovered after v1.9.0, so future planning does not immediately fall back into adding more features.

## Current baseline

Personal Place v1.9.0 has a reasonably mature internal domain model:

- **Today**: current-day orchestration
- **Todo**: things the user intends to handle
- **Place**: working context and continuation point
- **Focus**: what the user is doing now
- **Calendar**: external commitments
- **Activity**: what actually happened

The architecture is no longer the main problem.

The current problem is the **product experience**.

---

## Core diagnosis

### 1. A new user does not immediately understand what Personal Place is for

When the app opens, the user may reasonably interpret it as any of the following:

- launcher
- dashboard
- Todo app
- Focus timer
- calendar companion
- personal workspace manager

The product currently exposes multiple correct concepts, but does not give the user one obvious primary story.

A user should understand within a few seconds:

1. what they should look at first;
2. what they should do next;
3. how Personal Place helps them begin working.

Candidate product definition:

> **Personal Place is a local-first personal workspace that helps you decide what to do today, continue from where you left off, and start focusing.**

Treat this as a working hypothesis, not immutable marketing copy.

---

### 2. The planning / focus model is not self-evident

The internal model is coherent, but users should not need to reverse-engineer it.

Current concepts include:

```text
Todo       = what I need to handle
plannedFor = when I intend to work on it
Today      = what matters now
Place      = where / in what context I continue work
Focus      = what I am doing now
Activity   = what I actually did
```

The next product pass must make this flow understandable through the interface itself, not only through documentation or onboarding.

Desired mental flow:

```text
What do I need to do?
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

### 3. Pages / Places / grouping are too author-centric

The author understands why content is divided into Pages, Places and related working contexts.

A new user may instead think:

> Why am I being asked to organize things before I have received any benefit from organizing them?

Future UX should explain the **benefit**, not the data structure.

Bad framing:

> Create a group / divide content into areas.

Better framing:

> Put the things used for one activity together, save where you stopped, and continue from the same context next time.

Re-evaluate whether Page / Place terminology and navigation hierarchy make this value obvious enough.

---

### 4. The visual design does not support focus

This is not merely a cosmetic complaint.

The current interface can feel visually busy and does not consistently communicate:

- calmness;
- hierarchy;
- a single current action;
- low cognitive load;
- clear separation between primary and secondary information.

A productivity / focus tool should not make the user's eyes decide where to go every time the window opens.

Review:

- typography hierarchy;
- spacing system;
- card density;
- button density;
- decorative color usage;
- visual priority of sections;
- amount of simultaneous information;
- empty space;
- narrow-window behavior;
- distinction between planning mode and focus mode.

Do not solve this by only changing colors or applying a new skin.

---

## Next milestone: product consolidation before feature expansion

The next major effort should probably be treated as a **2.0 product consolidation**, not simply another feature release.

### A. Product narrative — resolved direction

The v1.9 README still primarily describes Personal Place as a local-first Windows digital homepage where users organize apps, websites, files, folders and notes into Pages and Places.

That description remains technically true, but it should no longer be the primary product story.

The stronger product direction is:

> **Personal Place is a local-first personal workspace that helps you decide what to do today, continue from where you left off, and start focusing.**

A shorter internal product test is:

> **Know what to do today, continue from where you stopped, then begin.**

#### Primary job

The primary job of Personal Place is not information management, Todo management, launching apps, time tracking, or running a timer in isolation.

The primary job is:

> **Reduce the activation cost between intending to work and actually starting.**

This becomes the product-level decision rule for future UX work.

If information or functionality does not help the user decide, continue, start, or later review, it should not automatically receive primary visual weight.

#### First 30 seconds for a new user

A new user should receive value before being asked to understand Pages, Places, Calendar, Activity, grouping, backup, widgets, or advanced organization.

The ideal first-use path is approximately:

```text
Open Personal Place
        ↓
What do you want to finish today?
        ↓
Add one task
        ↓
Today shows that task
        ↓
Start Focus
```

The user should be able to understand the product from this loop alone.

Do not require structural organization before the first useful action.

#### First 10 seconds for a returning user

The landing experience should respond to the user's current state.

If Focus is active:

```text
正在做
<current work>
<remaining / elapsed focus state>
[繼續]
```

If Today already has planned work:

```text
今天
<planned item>
[開始]
```

If Today is empty:

```text
今天還沒有安排
[從待辦選一件]
[新增一件事]
```

The default screen should not force the user to scan a dashboard to infer which state they are in.

#### User-facing domain meanings

The architecture may retain domain names and boundaries, but the interface should communicate benefits rather than implementation concepts.

| Domain | User-facing meaning |
| --- | --- |
| **Today** | 我現在該做什麼 |
| **Todo** | 別讓我要做的事情消失 |
| **Place** | 把一件工作的東西和進度留在原地，下次直接接著做 |
| **Focus** | 我已經決定了，現在只做這件事 |
| **Calendar** | 別讓固定行程撞到我的安排 |
| **Activity** | 我最後實際把時間花到哪裡 |
| **Page** | 東西變多後才需要的整理分區 |

#### Page is not a core onboarding concept

Page may remain useful in the product and architecture, but a new user should not need to understand a Page/Place hierarchy before receiving value.

Treat Page primarily as an advanced organization mechanism.

The interface may reveal it when the user's content grows rather than presenting it as part of the product's opening thesis.

#### Place remains strategically important

Place should not be reduced to a folder or group.

Its distinctive value is preserving a **working scene / continuation context**:

```text
Tools / files / links used for one activity
+
where I stopped last time
=
return to the same working context
```

The product should sell the benefit first:

> Leave the work where it is, then come back and continue.

Only then should the user need to learn the term `Place`.

#### Focus is a state, not merely a timer

Focus should represent the point where decision-making is over.

Today asks:

> What should I do?

Focus says:

> I already chose. Stop showing me alternatives.

Therefore a future real Focus Mode should primarily be a **subtractive visual state**.

The timer is supportive, not the defining feature.

#### Progressive disclosure

Do not teach every feature during first use.

Initial concepts should be close to:

```text
Today
Todo
Start
```

Reveal other concepts when they become useful:

```text
Repeatedly return to the same work?
→ Place

Have fixed commitments?
→ Calendar

Want to review where time actually went?
→ Activity
```

First give value. Then teach structure.

#### Product hierarchy

Future IA should treat domains with different product weight rather than as equal destinations.

```text
                  Personal Place

                      TODAY
                        │
            ┌───────────┴───────────┐
            │                       │
        今天做什麼？            正在做什麼？
            │                       │
          Todo                    Focus
            │
        從哪裡繼續？
            │
          Place

────────────────────────────────────────

            Calendar       Activity
              約束             回顧

────────────────────────────────────────

               Pages / Search
                   整理
```

This is a product-weight model, not yet a final UI layout.

#### Product principles established in A

1. **Personal Place's job is not to manage information; it is to reduce the cost of starting work.**
2. **Today is the product entry point, not merely another workspace.**
3. **Users should receive value before being asked to organize.**
4. **Place sells continuation of a working scene, not grouping.**
5. **Focus is a subtractive state, not merely a timer feature.**

These principles should constrain the next IA and visual-design passes.

#### Remaining A question: product feeling

Before finalizing the Today/home IA, define what the application should feel like.

Current candidate direction:

> **Calm, private, low-pressure, and like returning to your own work desk.**

Do not prematurely treat this as final visual styling. Resolve the emotional / interaction character first, then use it to judge what should be removed, hidden, demoted, or visually quieted.

---

### B. Today / home information architecture

Today should become an obvious starting point rather than another information dashboard.

Candidate priority:

```text
正在做
↓
今天安排
↓
今天到期 / 逾期
↓
繼續
```

Questions to resolve:

- Should Today be the default landing workspace?
- Which secondary information should disappear from the initial view?
- How many actions should be visible before the user chooses a task?
- Are Calendar and overdue information warnings, planning inputs, or equal-level sections?
- Does `Continue` communicate Place value clearly enough?

---

### C. Real Focus Mode

Focus is currently a domain and timer workflow, but the application may need a true **focus visual state**.

A Focus Mode should intentionally remove information.

Candidate contents:

- current Todo / Place title;
- optional context / continuation note;
- timer;
- pause / resume / end;
- minimal navigation or explicit exit back to planning.

Avoid duplicating the full Today or Dashboard UI inside Focus Mode.

The key design question is:

> When the user has already decided what to do, what can the interface safely stop showing?

---

### D. Visual system redesign

Create a small coherent visual system before individually restyling components.

Define at minimum:

- typography scale;
- spacing scale;
- surface hierarchy;
- primary / secondary / destructive action hierarchy;
- muted information rules;
- semantic color rules;
- maximum content density for a focus-oriented view;
- responsive / narrow-window behavior.

The design goal is not "more polished dashboard".

The design goal is:

> **less cognitive competition.**

---

## Explicit non-goals for the next planning pass

Do not use new features to hide the product problem.

Avoid prioritizing these until the core UX is clearer:

- AI task recommendations;
- productivity scores;
- automatic prioritization algorithms;
- additional dashboard widgets;
- additional Calendar integrations;
- cloud accounts / sync;
- more Activity metrics;
- more launcher features;
- additional planning fields;
- complex automation.

These may be useful later, but they do not answer the current problem.

---

## Questions the next architect pass must answer

Before producing a Luna implementation handoff, answer:

1. What is the single primary job of Personal Place? **Answered in A.**
2. What should a brand-new user do in the first 30 seconds? **Answered in A.**
3. What should a returning user do in the first 10 seconds? **Answered in A.**
4. Should Today become the default landing experience? **Direction strongly favors yes; resolve in B.**
5. What is the minimum information needed before starting Focus?
6. What disappears once Focus starts?
7. How should Place be explained without teaching database-like structure? **Answered in A.**
8. Which current UI elements compete for attention without enough value?
9. What should the application feel like visually: calm, focused, quiet, dense, playful, utilitarian, etc.? **Resolve before B is finalized.**
10. Which parts of the current UI should be deleted rather than redesigned?

---

## Success criteria for the next major UX pass

A successful redesign should make these statements true:

- A new user can explain what Personal Place does after using it briefly.
- The default screen has an obvious first action.
- The user does not need to understand every domain before receiving value.
- Planning and focusing feel like one continuous workflow.
- Place provides an obvious continuation benefit rather than feeling like mandatory categorization.
- Focus Mode visually reduces distraction instead of adding another dashboard.
- Primary and secondary information are immediately distinguishable.
- The interface feels calmer and more intentional than v1.9.0.
- New functionality is not required to achieve the improvement.

---

## Guidance for future Sol → Luna work

Do **not** immediately turn this document into a CODEX implementation handoff.

First:

1. perform a product / UX diagnosis against the current v1.9+ UI;
2. propose the target information architecture;
3. define the visual and interaction principles;
4. decide what should be removed, hidden, or demoted;
5. only then produce an implementation plan for Luna.

The next useful work is product consolidation, not another pile of features.
