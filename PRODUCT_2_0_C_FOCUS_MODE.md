# Personal Place 2.0 — C. Real Focus Mode

> Product / UX target for the 2.0 consolidation pass.
>
> This document resolves the C design pass. It is not yet a Luna implementation handoff.

## Status

**RESOLVED TARGET**

A established why Personal Place exists.

B established how the user moves from Today into work.

C establishes what Personal Place becomes **after the user has already decided what to do**.

The core rule is:

> **When the user has already decided what to do, the interface should safely stop offering alternatives.**

Focus is therefore not primarily a timer page.

It is a **subtractive application state**.

---

## 1. Keep the current Focus page's strongest idea

The v1.9 Focus page already contains the most useful visual seed in the application:

- large empty space;
- one strong center;
- lower information density than normal Pages;
- a clear timer;
- fewer competing surfaces.

Do not throw this away simply to make a new-looking 2.0 screen.

The problem is not the basic composition.

The problem is that the current page still behaves like a generic **Focus Timer workspace**. It exposes timer phases, history and settings while the user is already trying to focus.

2.0 should preserve the calm spatial skeleton while changing the hierarchy and behavior.

---

## 2. Focus Mode is an application state, not a popup

Do not turn Focus into a floating modal or separate utility window by default.

Target transition:

```text
Today / Place
      ↓
    [開始]
      ↓
create linked Focus state
      ↓
PERSONAL PLACE ENTERS FOCUS MODE
```

The whole application should visually acknowledge that the user has made a decision.

Focus Mode occupies the main application surface.

If an active Focus exists when Personal Place is reopened, startup should restore Focus Mode as defined in B.

---

## 3. Minimum information during active Focus

A running Focus session should normally show only information that serves the selected work or controls the Focus state.

Minimum set:

1. **What I am doing**
2. **Optional useful context for that work**
3. **Remaining time / Focus state**
4. **One primary Focus control**
5. **An explicit way to leave the Focus screen without accidentally ending the session**

Everything else must justify its presence.

Target shape for a Todo-linked Focus:

```text
                這是代辦喔
                學習

                 24:15

                  [暫停]

              結束這段專注

        ← 暫時離開專注畫面
```

Target shape for a Place-linked Focus:

```text
             Personal Place 2.0

             上次做到：
     Today hierarchy 已經整理完成，
          下一步處理 sidebar。

                 24:15

                  [暫停]

              結束這段專注
```

Exact typography belongs to D.

The hierarchy is resolved here:

> **The work itself is at least as important as the clock.**

Do not let a giant timer become the only thing the screen communicates.

Personal Place is helping the user do something, not asking them to stare at seconds disappearing.

---

## 4. Linked context rules

### Todo-linked Focus

Primary content:

- Todo title;
- optional quiet List / parent context;
- Focus timer and status.

Do not show the full Todo editor, due/planning controls, or Today management actions during active Focus.

The user has already selected this Todo.

### Place-linked Focus

Primary content:

- Place title;
- current `resumeNote` presented naturally as **上次做到** / continuation context when useful;
- timer and status.

If the Place has launchable work items, an action such as **開啟工作環境** is allowed because it directly serves the selected work.

This is not considered distracting navigation.

However:

- starting Focus must not silently launch unrelated items;
- opening the Place environment and starting Focus remain explicit actions;
- do not reintroduce the whole Page / card grid into Focus Mode.

### Unlinked Focus

Existing unlinked Focus capability may remain as a fallback.

If no Todo or Place is linked, do not invent fake context.

Use a neutral label such as:

```text
自由專注
```

Unlinked Focus should not become the primary 2.0 workflow.

---

## 5. Sidebar behavior: remove it during Focus

The normal sidebar should **disappear entirely** while active Focus Mode is shown.

Do not merely dim it.

Do not keep a collapsed row of icons inviting the user to visit:

- Today;
- Todo;
- Games;
- Learning;
- Calendar;
- Activity;
- Settings;
- other Pages.

Those are alternatives, and Focus Mode exists specifically because the user has already stopped choosing.

Provide one quiet explicit exit path instead:

```text
← 暫時離開專注畫面
```

or equivalent wording.

Leaving Focus Mode is not the same as stopping Focus.

This distinction must be obvious.

---

## 6. Leaving Focus Mode while the session remains active

The user must be allowed to intentionally leave Focus Mode without pausing or ending the session.

Target behavior:

```text
Active Focus Mode
      ↓
[暫時離開專注畫面]
      ↓
Today
      ↓
compact active-focus return state
```

Today then shows only something like:

```text
正在做
Personal Place 2.0
18:42                         [回到專注]
```

As resolved in B:

- Today does not duplicate pause / resume / end controls;
- navigation becomes available again only after intentionally leaving Focus Mode;
- returning to Focus Mode is obvious;
- the underlying Focus session continues unchanged.

This creates intentional friction without trapping the user.

---

## 7. Focus controls by state

Focus Mode should not display the same control set in every state.

### Running

Primary action:

```text
[暫停]
```

Secondary action:

```text
結束這段專注
```

Do not place multiple equally weighted actions around the timer.

### Paused

Primary action:

```text
[繼續]
```

Secondary action:

```text
結束這段專注
```

The paused screen should still preserve the selected work context.

Pause means the session is interrupted, not forgotten.

### Idle

Idle is not really “Focus Mode”.

When no active / paused Focus exists, the user should normally be in Today, Place, or another planning context.

Do not make an empty Focus Timer workspace a major top-level destination in 2.0.

Timer setup can remain available outside the active mode, but Focus Mode itself begins when a session begins.

---

## 8. Remove phase selection from active Focus

The current Focus Timer exposes persistent controls for:

```text
專注
短休息
長休息
```

This makes sense for a Pomodoro utility but is too much choice during the active Personal Place Focus state.

Once a Focus phase has started:

- hide phase-selection controls;
- do not ask whether the user would rather be in another phase;
- keep only controls relevant to the current state.

Phase choice belongs at a transition point, not as permanent active-screen navigation.

---

## 9. Remove history and statistics from active Focus

The current Focus page includes today's Focus session history while the user is still focusing.

That information should leave the active Focus screen.

Do not show during running / paused Focus:

- number of Focus sessions today;
- total minutes focused today;
- past session list;
- productivity score;
- streaks;
- completion percentage;
- comparison against previous days.

Reason:

> **Review information changes the user's question from “what am I doing?” to “how well am I performing?”**

That violates the target product character: calm, low-pressure and non-judgmental.

Focus history may remain accessible outside Focus Mode.

Its exact long-term home can be resolved in D / implementation planning without forcing it into Activity prematurely.

---

## 10. Remove timer settings from active Focus

The current Focus workspace contains collapsible timer settings.

Do not keep Focus duration configuration inside the active Focus screen.

During Focus, settings such as:

- focus minutes;
- short-break minutes;
- long-break minutes;
- long-break interval;

are administrative configuration.

They belong in Settings or a pre-start configuration surface.

The active screen should not invite the user to redesign the timer while trying to use it.

---

## 11. Breaks are transitions, not the identity of the product

Personal Place may continue to support short and long breaks, but 2.0 should not reorganize the product around Pomodoro terminology.

When a Focus interval ends, the user reaches a transition state.

Target tone:

```text
這一段結束了

先停一下也可以。

[休息一下]      [回到今天]
```

Optional secondary path:

```text
再專注一段
```

Do not automatically turn the screen into a scoreboard.

Do not imply the linked Todo is finished merely because one Focus interval ended.

### Break Mode

A break is also a low-choice state.

Example:

```text
休息一下

04:32

[結束休息]
```

The work title may be absent or extremely quiet during the break.

Do not show Today tasks, overdue work, Activity history or Page navigation inside the break state.

The user is allowed to stop looking at work for a few minutes. Revolutionary concept, apparently.

### Short vs long break

The existing settings may still determine duration / cadence.

Do not keep “短休息 / 長休息 / 專注” as three permanent tabs during a running session.

If the user needs a manual choice, present it only at the transition point.

---

## 12. What happens when Focus ends

Ending a Focus interval and completing a Todo are different actions.

Preserve the domain distinction:

```text
Focus session ended
!=
Todo completed
```

Do not automatically check off a Todo when Focus ends.

After an intentional end or normal completion, show a quiet completion / transition state.

For a linked Todo, an optional secondary action may be offered:

```text
標記待辦完成
```

but it must remain an explicit user decision.

For a linked Place, 2.0 does not require inventing a new automatic progress-capture system.

Updating `resumeNote` / “上次做到” may remain an explicit action outside the minimum C scope.

The important rule is:

> **Ending Focus should release the user from Focus Mode without pretending to know whether the underlying work is finished.**

---

## 13. Completion screen is not a performance review

When a Focus period ends, useful feedback is limited to the immediate transition.

Good:

```text
這一段結束了
25 分鐘
```

Potential actions:

```text
[回到今天]
[休息一下]
再專注一段
```

Avoid:

```text
今天只完成 1 次
今日效率 18%
連續紀錄中斷
還有 4 個待辦未完成
```

Focus completion is not the moment to ambush the user with a quarterly earnings call.

---

## 14. Focus Mode may contain actions that serve the current work

“Remove choices” does not mean “remove every useful button”.

Allowed Focus Mode actions should pass this test:

> **Does this action directly help the work I already chose, or control the current Focus state?**

Allowed examples:

- pause / resume;
- end Focus;
- open the linked Place work environment;
- leave Focus Mode without ending the session;
- return to Focus Mode;
- perhaps open one clearly linked resource if the product later models it explicitly.

Disallowed examples during active Focus:

- browse another Page;
- pick another Todo;
- inspect Activity history;
- edit Calendar;
- organize cards;
- change themes;
- browse usage statistics.

These capabilities still exist. They simply stop competing with the current decision.

---

## 15. Visual priority contract for D

C does not define final colors, type sizes or exact spacing, but it establishes the order D must serve.

Active Todo Focus priority:

```text
1. Work title / selected work
2. Focus state and remaining time
3. Primary control
4. Useful linked context
5. Secondary end / exit actions
```

Active Place Focus priority:

```text
1. Place / work title
2. Continuation context (“上次做到”)
3. Focus state and remaining time
4. Primary control
5. Optional open-work-environment action
6. Secondary end / exit actions
```

The timer may remain large, but it should not overpower the meaning of the selected work.

---

## 16. Focus Mode should feel quieter than Today

Today is allowed to present choices because its job is planning / deciding.

Focus Mode should feel like the application has physically become quieter after the user chooses.

Target contrast:

```text
TODAY
choices
planning
small amounts of attention information
navigation available

        ↓ Start

FOCUS
one work context
one time state
one primary control
navigation removed
review information removed
```

The transition itself should communicate:

> **You do not need to decide anymore.**

---

## 17. Explicit deletions / demotions resolved by C

The following should not remain visible in active Focus Mode:

- normal sidebar navigation;
- Today task list;
- Page navigation;
- Calendar information;
- due / overdue warnings;
- Activity / usage summaries;
- Focus session history;
- today's Focus count;
- timer settings;
- persistent phase-selection tabs;
- Page organize controls;
- theme / Settings access;
- generic dashboard widgets.

These are not deleted from the product merely because they disappear from Focus Mode.

They are **removed from the active attentional field**.

---

## 18. C state model

```text
NO ACTIVE FOCUS
      │
      ├── Today / Place / other planning context
      │
      └── Start
            ↓

RUNNING FOCUS MODE
      │
      ├── Pause → PAUSED FOCUS MODE
      │              │
      │              └── Resume → RUNNING
      │
      ├── Leave screen → Today compact active state
      │                      │
      │                      └── Return → FOCUS MODE
      │
      ├── End → COMPLETION TRANSITION
      │
      └── Timer completes → COMPLETION TRANSITION
                                │
                                ├── Return to Today
                                ├── Start break
                                └── Focus again

BREAK MODE
      │
      ├── Complete → Today / transition
      └── End break → Today / transition
```

The precise backend events may differ. This is the user-facing state model.

---

## 19. C success criteria

C is successful if a future implementation can make these statements true:

- Starting a Todo / Place Focus visibly changes Personal Place into Focus Mode.
- The active screen immediately communicates **what the user chose to do**.
- The normal sidebar is absent during active Focus.
- The user can intentionally leave Focus Mode without stopping the session.
- Today provides an obvious route back to an active Focus.
- Running Focus exposes one obvious primary action.
- Paused Focus exposes one obvious primary action.
- Focus history and productivity-like information are absent during active Focus.
- Timer configuration is absent during active Focus.
- Persistent phase-selection tabs are absent during active Focus.
- Breaks feel like permission to stop rather than another dashboard.
- Ending Focus does not automatically complete a linked Todo.
- Focus completion does not judge the user's performance.
- The selected work has equal or greater semantic importance than the timer.
- Focus Mode is visually and cognitively quieter than Today.
- No new productivity metric is required to achieve the redesign.

---

## 20. Product principle added by C

A and B established that Personal Place should reduce the cost of deciding and starting.

C adds the complementary rule:

> **Once the user has started, Personal Place should reduce the cost of staying with the decision.**

This is the purpose of Focus Mode.

---

## What C does not decide

Leave these for D / implementation planning:

- exact typography scale;
- exact timer size;
- exact colors;
- animation / transition timing;
- precise breakpoint behavior;
- final iconography;
- exact placement of secondary exit controls;
- final visual treatment of break state;
- final destination for Focus history outside active Focus;
- whether any legacy Page Focus widget should survive the 2.0 cleanup.

C defines behavior and attentional hierarchy.

D defines the visual system that expresses it.

---

## Design sequence status

```text
A Product narrative        ✓
B Today / Home IA          ✓
C Real Focus Mode          ✓
D Visual system            ← next
Implementation handoff     after D
```

Do not produce a major Luna implementation handoff until D resolves the visual system and final deletion / demotion decisions.