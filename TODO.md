# Personal Place Product TODO

> Read this before proposing the next feature release.
>
> This document preserves the product-level problems and design decisions discovered after v1.9.0 so future planning does not immediately fall back into adding more features.

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

The product exposes multiple correct concepts, but does not give the user one obvious primary story.

A user should understand within a few seconds:

1. what they should look at first;
2. what they should do next;
3. how Personal Place helps them begin working.

### 2. The planning / focus model is coherent internally but not self-evident

```text
Todo       = what I need to handle
plannedFor = when I intend to work on it
Today      = what matters now
Place      = where / in what context I continue work
Focus      = what I am doing now
Activity   = what I actually did
```

Users should not need to reverse-engineer this architecture.

The interface itself should communicate a simple flow:

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

### 3. Pages / Places / grouping are too author-centric

The author understands why content is divided into Pages, Places and related working contexts.

A new user may instead think:

> Why am I being asked to organize things before I have received any benefit from organizing them?

Future UX should explain the **benefit**, not the data structure.

Bad framing:

> Create a group / divide content into areas.

Better framing:

> Put the things used for one activity together, save where you stopped, and continue from the same context next time.

### 4. The visual design still serves the old dashboard / launcher identity

The current interface is not simply “ugly”. Its visual hierarchy still assumes that many pieces of information deserve simultaneous attention.

This conflicts with the newer product direction.

Observed issues in v1.9 include:

- Today sections often receive similar visual weight even when their product importance is very different;
- empty Calendar state can occupy more space than useful work;
- Page cards expose repeated metadata and administrative affordances during normal use;
- sidebar navigation leaks implementation hierarchy and gives Pages too much weight relative to Today;
- Focus is visually cleaner than the rest of the app, but still behaves too much like a timer workspace rather than a true application state;
- history / statistics can remain visible while the user is trying to focus;
- too many bordered surfaces compete for attention.

The design problem is **cognitive competition**, not merely color choice.

---

# Next milestone: 2.0 product consolidation before feature expansion

Do not treat the next major effort as another feature release.

The goal is to make the existing product understandable, directional and calm before expanding capability.

---

## A. Product narrative — RESOLVED

### Product promise

The v1.9 README still describes Personal Place primarily as a local-first Windows digital homepage where users organize apps, websites, files, folders and notes into Pages and Places.

That remains technically true, but it should no longer be the primary product story.

Target direction:

> **Personal Place is a local-first personal workspace that helps you decide what to do today, continue from where you left off, and start focusing.**

Short internal test:

> **Know what to do today, continue from where you stopped, then begin.**

### Primary job

The primary job of Personal Place is not information management, Todo management, launching apps, time tracking, or running a timer in isolation.

The primary job is:

> **Reduce the activation cost between intending to work and actually starting.**

This is the product-level decision rule for future UX work.

If information or functionality does not help the user decide, continue, start, or later review, it should not automatically receive primary visual weight.

### First 30 seconds for a new user

A new user should receive value before being asked to understand Pages, Places, Calendar, Activity, grouping, backup, widgets, or advanced organization.

Ideal first-use loop:

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

Do not require structural organization before the first useful action.

### First 10 seconds for a returning user

The landing experience should respond to current state.

If Focus is active:

```text
Return to Focus Mode
```

If Today has planned work:

```text
今天
<planned work>
[開始]
```

If Today is empty:

```text
今天還沒有安排
[從待辦選一件]
[新增一件事]
```

The user should not have to scan a dashboard to infer what they are supposed to do.

### User-facing domain meanings

| Domain | User-facing meaning |
| --- | --- |
| **Today** | 我現在該做什麼 |
| **Todo** | 別讓我要做的事情消失 |
| **Place** | 把一件工作的東西和進度留在原地，下次直接接著做 |
| **Focus** | 我已經決定了，現在只做這件事 |
| **Calendar** | 別讓固定行程撞到我的安排 |
| **Activity** | 我最後實際把時間花到哪裡 |
| **Page** | 東西變多後才需要的整理分區 |

### Page is not a core onboarding concept

Page may remain useful in the architecture and product, but new users should not need to understand a Page / Place hierarchy before receiving value.

Treat Page primarily as an organization mechanism revealed when useful.

### Place remains strategically important

Place should not be reduced to a folder or group.

Its distinctive value is preserving a working scene / continuation context:

```text
Tools / files / links used for one activity
+
where I stopped last time
=
return to the same working context
```

Sell the benefit first:

> Leave the work where it is, then come back and continue.

Only then should the user need to learn the term `Place`.

### Focus is a state, not merely a timer

Today asks:

> What should I do?

Focus says:

> I already chose. Stop showing me alternatives.

Focus must therefore become a **subtractive application state**. The timer is supportive, not the defining feature.

### Progressive disclosure

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

### Product feeling / interaction character

Based on the v1.9 UI review, the target character is now:

> **Calm, private, low-pressure, directed, non-judgmental — like returning to your own work desk.**

Important distinctions:

- **calm** does not mean empty or directionless;
- **directed** means the interface gently makes the next useful action obvious;
- **low-pressure** means overdue work and empty days should not become alarm walls;
- **non-judgmental** means no productivity score, streak pressure, shame-oriented completion language, or intrusive “you only focused X minutes” feedback;
- **private** means the interface should feel like the user's own working space rather than a corporate performance dashboard.

### Product principles established in A

1. **Personal Place's job is not to manage information; it is to reduce the cost of starting work.**
2. **Today is the product entry point, not merely another workspace.**
3. **Users should receive value before being asked to organize.**
4. **Place sells continuation of a working scene, not grouping.**
5. **Focus is a subtractive state, not merely a timer feature.**
6. **The product should provide direction without judging the user.**

---

## B. Today / Home information architecture — RESOLVED TARGET

B defines how users move through Personal Place. It is a product-weight and interaction model, not yet the final visual styling system.

### 1. Startup behavior

The application should no longer behave as though the last visited Page is an equally valid default home.

Target startup rule:

```text
Active Focus exists
        ↓
Open / restore Focus Mode

No Active Focus
        ↓
Open Today
```

**Today owns the default entry experience.**

Pages are destinations the user intentionally enters.

### 2. Sidebar hierarchy

The current sidebar visually mixes user-created Pages with system-level workspaces. This leaks architecture and makes Pages appear as important as Today.

Target hierarchy:

```text
Today
Todo

My spaces
  日常
  學習
  遊戲
  Live2D
  跑團
  繪圖

Calendar
Activity

Settings
```

Exact labels and visual grouping can be refined later, but the product weight is resolved:

- Today is first;
- Todo is a core source of planned work;
- Pages belong under a lower-weight “my spaces” concept;
- Calendar and Activity are secondary system tools;
- Settings remains peripheral.

#### Remove global “整理” navigation

`整理` is not a destination. It is an editing state.

Do not keep it as a global workspace in the primary navigation.

Instead, a Page should expose a contextual action such as:

```text
遊戲                                  [整理]
```

Only after entering organize/edit mode should administrative controls become prominent.

### 3. Today is stateful, not a fixed dashboard

Today should adapt to what the user currently needs instead of rendering all domains with similar visual weight.

Three important states:

#### State A — planned work exists, no active Focus

Primary content:

```text
今天
8 月 31 日 · 星期一

[next Calendar constraint only if useful]

今天安排

□ Personal Place 2.0                 [開始]
  開發

□ 人體練習                           [開始]
  繪圖

需要留意
今天到期 2 · 逾期 1                  [查看]

接著做
Personal Place
上次做到：重新整理 Today hierarchy   [接著做]
```

The key point is hierarchy, not this exact typography.

Do not wrap every section in equally weighted large cards.

#### State B — Today has no planned Todo

The empty state should give a gentle next step, not merely announce emptiness.

Target behavior:

```text
今天還沒安排

選一件現在值得做的事就好。

[從待辦選一件]   [新增待辦]

上次做到
<recent Place / continuation context if available>
[接著做]
```

This should feel directional but non-judgmental.

Do not show completion pressure, streaks, scores, or “0 / N” shame states.

#### State C — Focus is active but user manually returns to Today

Today should not duplicate the full Focus controls.

Show only a compact return path:

```text
正在做
Personal Place 2.0
18:42                              [回到專注]
```

Pause / resume / end belong to Focus Mode.

### 4. Today planned work is the primary normal-state content

`plannedFor == today` represents explicit user intent and should receive the strongest task-level weight.

A normal planned Todo row should expose one obvious action:

```text
□ 這是代辦喔
  學習                                 [開始]
```

Management actions such as:

- 移出今天
- 改日期
- 查看 / edit details

should be demoted to overflow, context menu, hover affordance, or another secondary interaction pattern.

Principle:

> **Before the user chooses a task, do not make them manage the task at the same visual priority as starting it.**

### 5. Starting Focus is a mode transition

The interaction contract should become:

```text
Today
  ↓
[開始]
  ↓
create linked Focus
  ↓
enter Focus Mode
```

Do not start Focus silently in the background while leaving the user in the planning interface.

Starting Focus means decision-making is over and the application should transition accordingly.

### 6. Calendar in Today is a constraint, not a section competing for attention

Calendar's role in Today is to answer:

> How much uninterrupted time do I actually have before a fixed commitment?

Therefore:

#### No upcoming blocking event

Show nothing.

Do not give “今天沒有固定行程” a large permanent surface.

#### Upcoming event

Show compact secondary information near the Today heading or planned-work context, for example:

```text
下一個行程  14:00 開會 · 1 小時 20 分後
```

#### Event currently in progress

It may receive slightly more weight, but still should not replace the user's primary work intent.

Calendar is a **time constraint**, not an equal-level homepage module.

### 7. Due / overdue are attention inputs, not the plan itself

The 1.9 domain contract remains important:

```text
plannedFor != dueAt
```

The UI should reinforce this distinction.

Do not show Today Planned, Due Today and Overdue as three equally dominant task lists.

Target collapsed summary:

```text
需要留意
今天到期 2 · 逾期 1                  [查看]
```

Expanded / detail state may show:

```text
今天到期
□ 電費                               [排到今天]
□ 回信                               [排到今天]

逾期
□ Unity Notes · 8/29                 [排到今天]
```

In this attention list, the primary action is **排到今天**, not Start Focus.

Desired mental model:

```text
Deadline / overdue
        ↓
decide to plan it today
        ↓
Today Planned
        ↓
Start
        ↓
Focus
```

This teaches the planning model through interaction rather than documentation.

### 8. Place / continuation language in Today

Today should communicate the benefit of Place before teaching structural vocabulary.

Prefer user-facing framing such as:

```text
接著做

Personal Place

上次做到：
Today hierarchy 已定，下一步處理 sidebar。

[接著做]
```

`resumeNote` may remain the internal field and `接續點` may still be useful in edit/detail contexts, but the normal Today experience should favor natural continuation language such as **上次做到**.

Place should feel like returning to a working scene, not opening a folder.

### 9. Page / home relationship

Pages remain useful but are no longer competing home screens.

Normal Page experience should increasingly feel like entering a personal space rather than an administration dashboard.

At B level, resolve only the information hierarchy:

- Page is intentionally entered from “My spaces”;
- Page does not own startup;
- normal Page mode should emphasize content / entry points;
- editing metadata, movement, deletion, grouping and similar administration should be contextual to organize mode;
- whether legacy Focus / usage widgets remain in Pages is deferred to D, where duplication and visual-system cleanup will be judged explicitly.

### 10. Target product flow

The resolved IA should be understood as one path rather than seven equal features:

```text
                    PERSONAL PLACE
                          │
                          ▼
                        TODAY
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
         今天安排       接著做       時間約束
             │          Place        Calendar
             │
             ▼
           START
             │
             ▼
           FOCUS
             │
             ▼
        完成 / 結束
             │
             ▼
          ACTIVITY

Todo = source of things that may be planned
Page = intentional entry into personal working spaces
```

The important conceptual change is:

> Personal Place is no longer a collection of equally weighted destinations. It is a workflow with supporting spaces and review tools.

### 11. B success criteria

B is successful if the future implementation can make these statements true:

- Opening Personal Place immediately communicates that Today is the place to start.
- Without an active Focus, a returning user can choose something and begin within a few seconds.
- With an active Focus, the product prioritizes returning to Focus rather than presenting alternatives.
- An empty Today offers one gentle next step without creating pressure.
- Calendar absence consumes no meaningful screen space.
- Due / overdue remain visible when needed but do not override the user's explicit Today plan.
- Starting a planned task visibly transitions into Focus Mode.
- Place clearly communicates “continue from where I stopped”.
- Page navigation is understandable as personal spaces rather than system-level workflow.
- Organization / administration controls are hidden until the user enters an editing context.
- Normal Today state has one obvious primary task action: **Start**.

---

## C. Real Focus Mode — NEXT DESIGN PASS

The current Focus page already contains a useful visual seed: large empty space, a strong central timer and lower information density than the rest of the app.

Do not discard it automatically.

The next pass should determine how to promote it from a “Focus Timer workspace” into a true **Personal Place Focus State**.

Questions to resolve:

- What is the minimum information required during Focus?
- Should the sidebar disappear entirely, collapse, or become a single exit control?
- How prominently should linked Todo / Place context appear relative to the timer?
- Should pause / resume / end remain central while phase-selection controls disappear after Focus starts?
- What information should only appear after Focus ends rather than during it?
- How should breaks behave without turning Personal Place into a generic Pomodoro app?
- What happens when the user intentionally leaves Focus Mode while the Focus session remains active?

Core principle:

> **When the user has already decided what to do, the interface should safely stop offering alternatives.**

---

## D. Visual system redesign — AFTER C

Create a coherent visual system before individually restyling every component.

The UI review already suggests these principles:

1. **One screen should have one primary visual focal point.**
2. **Empty states should not be visually louder than meaningful content.**
3. **Planning mode may offer choices; Focus mode must remove choices.**
4. **Page is a space, not a dashboard; metadata should be quiet by default.**
5. **Today is the entry point; system navigation should reflect that priority over Pages.**
6. **Activity / history is review information and should not intrude into active Focus.**
7. **Personal Place provides direction without judging the user.**

Define at minimum:

- typography scale;
- spacing scale;
- surface hierarchy;
- primary / secondary / destructive action hierarchy;
- muted information rules;
- semantic color rules;
- maximum content density for focus-oriented views;
- responsive / narrow-window behavior;
- rules for when cards / borders are necessary versus when typography and whitespace are enough.

The design goal is not “more polished dashboard”.

The design goal is:

> **less cognitive competition.**

---

## Explicit non-goals before the consolidation work is complete

Do not use new features to hide the product problem.

Avoid prioritizing:

- AI task recommendations;
- productivity scores;
- streaks or gamified pressure;
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

## Architect checklist status

Before producing a major Luna implementation handoff:

1. What is the single primary job of Personal Place? **Answered in A.**
2. What should a brand-new user do in the first 30 seconds? **Answered in A.**
3. What should a returning user do in the first 10 seconds? **Answered in A + B.**
4. Should Today become the default landing experience? **Yes, resolved in B.**
5. What is the minimum information needed before starting Focus? **Partially answered in B; finalize in C.**
6. What disappears once Focus starts? **Resolve in C.**
7. How should Place be explained without teaching database-like structure? **Answered in A + B.**
8. Which current UI elements compete for attention without enough value? **Initial diagnosis complete; finalize deletions in D.**
9. What should the application feel like visually? **Answered in A.**
10. Which parts of the current UI should be deleted rather than redesigned? **Resolve during C / D before implementation handoff.**

---

## Success criteria for the 2.0 UX pass

A successful redesign should make these statements true:

- A new user can explain what Personal Place does after using it briefly.
- The default screen has an obvious first action.
- The user does not need to understand every domain before receiving value.
- Planning and focusing feel like one continuous workflow.
- Place provides an obvious continuation benefit rather than feeling like mandatory categorization.
- Focus Mode visually reduces distraction instead of adding another dashboard.
- Primary and secondary information are immediately distinguishable.
- The interface feels calmer and more intentional than v1.9.0.
- The interface feels private and non-judgmental rather than performance-oriented.
- New functionality is not required to achieve the core improvement.

---

## Guidance for future Sol → Luna work

Do **not** turn A or B directly into a CODEX implementation handoff yet.

Complete the design sequence first:

1. **A — product narrative** ✅
2. **B — Today / Home IA** ✅
3. **C — real Focus Mode** ← next
4. **D — visual system + explicit deletion / demotion decisions**
5. only then produce an implementation plan for Luna

The next useful work is still product consolidation, not another pile of features.
