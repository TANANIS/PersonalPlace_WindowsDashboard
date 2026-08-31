# Personal Place 2.0 — D. Visual System and UI Deletion Pass

> Product / visual target for the 2.0 consolidation pass.
>
> This document resolves the D design pass. It is not yet a Luna implementation handoff.

## Status

**RESOLVED TARGET**

A established why Personal Place exists.

B established how the user moves through Today into work.

C established what Personal Place becomes after the user starts Focus.

D establishes how the product should **look, feel, prioritize, and remove visual competition**.

The central visual rule is:

> **Use typography, spacing and omission before using another card, border, badge, glow or color block.**

The goal is not a prettier dashboard.

The goal is a calmer personal workspace.

---

## 1. Visual thesis

Target character:

> **Calm, private, low-pressure, directed, non-judgmental — like returning to your own work desk.**

The interface should feel intentional without feeling sterile.

It may still be dark, modern and slightly atmospheric, but it must stop behaving like a cyber dashboard where every surface asks to be inspected.

The user should experience three different levels of visual energy:

```text
FOCUS
quietest
one work context
almost no navigation

TODAY
calm but directional
one primary decision area
small secondary signals

PAGE / TODO / CALENDAR / ACTIVITY / SETTINGS
normal working density
information available when intentionally entered
```

The same design system serves all three, but density and visible controls must change by state.

---

## 2. One screen, one focal point

Every major screen must have one obvious visual center.

Examples:

- Today → today's planned work / empty next step;
- Focus → selected work + focus state;
- Page → the Page contents;
- Place → current working context / continuation + content;
- Todo → current list and items;
- Calendar → selected date agenda;
- Activity → chosen review period;
- Settings → current settings section.

Do not create several large equally saturated cards just because several domains are technically present.

A secondary section should look secondary.

An empty section should usually become smaller or disappear.

---

## 3. Surface hierarchy

The current interface overuses bordered rounded rectangles. 2.0 should define a strict surface hierarchy.

### Level 0 — application background

The default canvas.

Use a restrained dark neutral background.

Atmospheric gradients may remain extremely subtle, but they should never create bright colored corners that compete with content.

### Level 1 — quiet grouping

Default for most information groups.

Prefer:

- whitespace;
- heading + content;
- optional hairline divider.

Do **not** automatically create a card.

Today sections should mostly live here.

### Level 2 — interactive surface

Use when the whole surface is meaningfully clickable or manipulable.

Examples:

- Page launcher item;
- Place content item;
- selectable Todo row when needed;
- compact active Focus return surface.

One subtle border or tonal surface is sufficient.

### Level 3 — raised / temporary surface

Use for:

- inspectors;
- dialogs;
- menus;
- expanded detail / temporary overlays;
- error recovery surfaces.

These may use stronger separation.

### Rule

Avoid nested bordered rectangles unless the child is a genuinely independent control surface.

A bordered card containing another bordered card containing button pills is usually a sign that hierarchy is being delegated to CSS instead of design.

---

## 4. Typography hierarchy

Typography becomes the primary hierarchy tool.

Target scale, approximate rather than implementation-locked:

```text
Display / Focus work title     32–44 px
Page / workspace title         32–40 px
Major section title            20–24 px
Task / card title              15–18 px
Body                           14–16 px
Secondary metadata             12–13 px
Eyebrow / technical label      10–12 px
```

Rules:

- do not make every workspace title enormous;
- Focus work title must be semantically at least as important as the timer;
- metadata should never visually rival task names;
- uppercase eyebrow labels such as `FOCUS TIMER`, `CONTENTS`, `LOCAL`, `ACTIVE TOTAL TIME` should be used sparingly;
- if the Chinese heading already explains the section, an English eyebrow is optional rather than mandatory decoration.

### Text weight

Use roughly three meaningful emphasis levels:

1. strong / primary;
2. normal;
3. muted.

Avoid solving hierarchy by making many labels bold.

---

## 5. Spacing system

Use a predictable spacing scale rather than local one-off gaps.

Recommended conceptual scale:

```text
4
8
12
16
24
32
48
64
```

Not every value must become a CSS token, but implementation should converge toward a small family.

Rules:

- 8–12: internal control relationships;
- 16–24: row / component grouping;
- 32–48: major section separation;
- 48–64: page-level breathing room where appropriate.

Today and Focus should intentionally use more vertical breathing room than Todo or Settings.

Whitespace is not wasted capacity. In this product it is part of the focus mechanism.

---

## 6. Content width

Do not stretch calm reading / decision interfaces across every available desktop pixel.

### Today

Prefer a readable central content column around roughly 720–880 px, with optional small secondary information nearby when justified.

### Focus

Use a narrow centered composition. Large empty margins are desirable.

### Page / Place

May use a wider canvas because spatial browsing is the point. A launcher grid can expand meaningfully with window width.

### Todo / Calendar / Activity / Settings

May use wider structured workspaces when the information model benefits from multiple panes.

The product should not force one universal max-width on every domain.

---

## 7. Color system

The existing selectable accent themes (`cyan`, `violet`, `mint`, `amber`, `rose`) may remain. The theme feature itself is not the visual problem.

However, 2.0 changes the role of accent color.

### Accent color is semantic emphasis, not wallpaper

Use accent for:

- current navigation location;
- primary action;
- selected state;
- keyboard focus indication;
- small meaningful emphasis.

Avoid using the accent to fill every section, create large glowing surfaces, or decorate every card.

### Neutral surfaces dominate

The majority of the app should remain neutral so accent color can mean something when it appears.

### Warning / danger

Use warning / red tones only when they communicate a genuinely useful state.

An overdue Todo may have quiet overdue metadata without turning the entire row red.

Destructive actions may use danger styling after the user enters a destructive context.

Do not turn Today into an alarm wall.

### Focus

Focus Mode should use even less accent than Today.

The selected work is the center, not a colored container.

---

## 8. Shadows, glow and decorative effects

The current card system contains glow, gradient and raised-card effects that reinforce the old launcher/dashboard identity.

2.0 rule:

> **Depth must communicate structure, not spectacle.**

Use shadows mainly for overlays, floating menus and genuinely raised surfaces.

Normal content surfaces should rely primarily on tone and border.

### Remove / strongly reduce

- decorative per-card glow blobs;
- bright accent bloom around normal launcher cards;
- large decorative gradients behind ordinary informational sections;
- hover movement that makes every tile feel like an advertisement.

Subtle hover elevation is acceptable for a clickable Page entry, but should be small.

Focus Mode should contain no decorative motion competing with the selected work.

---

## 9. Border radius

Current UI often uses large radii on almost every element, which contributes to the feeling that everything is a card.

2.0 should use radius by role:

```text
small controls / tags        6–10 px
buttons / inputs             8–12 px
interactive surfaces         12–16 px
large dialogs / overlays     16–20 px
```

Avoid making every normal information group a 20+ px rounded panel.

---

## 10. Buttons and action hierarchy

Each local decision area should normally expose **one primary action**.

### Primary

Use filled accent styling.

Examples:

- Today Todo → 開始;
- empty Today → 從待辦選一件 (or whichever action is chosen as primary);
- Focus running → 暫停;
- Focus paused → 繼續;
- Place → 開啟工作環境 / 接著做 when appropriate.

### Secondary

Use quiet neutral or text treatment.

### Tertiary / maintenance

Prefer:

- overflow menu;
- hover / focus reveal;
- context menu;
- organize mode;
- inspector.

Examples:

- 移出今天;
- 改日期;
- move up/down;
- repair / metadata operations when not currently needed.

### Destructive

Do not keep destructive controls visually loud in ordinary browsing.

Reveal them only in an explicit edit / detail context.

---

## 11. Motion

Motion should confirm state changes, not constantly animate the interface.

Recommended behavior:

- 120–180 ms for hover / reveal / simple state transitions;
- slightly longer only for intentional mode transitions such as entering Focus;
- no continuous edit-mode wobble / pulse unless it communicates something impossible to understand otherwise;
- respect `prefers-reduced-motion`;
- Focus Mode should have no looping decorative animation.

Entering Focus may gently remove surrounding UI and settle the selected work into the center. The transition should feel like noise leaving the room.

---

## 12. Sidebar target

The current ~92 px icon rail gives Pages and system workspaces very similar visual weight and forces users to infer architecture from icons and tiny labels.

2.0 should favor a **text-first grouped sidebar** on normal desktop widths.

Conceptual target:

```text
Personal Place

今天
待辦

我的空間
  日常
  學習
  遊戲
  Live2D
  跑團
  繪圖

行事曆
活動

設定
```

Recommended desktop width: roughly 180–220 px, subject to implementation testing.

Rules:

- Today gets first position and strongest selected treatment;
- Todo is core workflow navigation;
- Pages are grouped as personal spaces;
- Calendar / Activity are lower-weight support tools;
- Settings stays peripheral;
- global `整理` is removed;
- avoid turning every navigation item into a large rounded tile.

### Narrow window

Do not shrink back into a permanently dense icon arcade.

Prefer a collapsible / temporary navigation drawer below a practical breakpoint.

### Focus

Sidebar disappears entirely as resolved in C.

---

## 13. Today visual target

Today should rely primarily on typography and spacing.

Do not recreate the v1.9 layout with prettier cards.

Conceptual composition:

```text
今天
8 月 31 日 · 星期一

下一個行程  14:00 開會 · 1 小時 20 分後    [only if useful]

今天安排

□ Personal Place 2.0                      開始
  開發

□ 人體練習                                開始
  繪圖

需要留意
今天到期 2 · 逾期 1                       查看

接著做
Personal Place
上次做到：Today hierarchy 已完成…          接著做
```

Rules:

- no large empty Calendar card;
- no equally weighted purple blocks for each domain;
- planned work receives the largest usable section;
- due / overdue are compact until opened;
- continuation feels editorial / human rather than database-like;
- normal Today should not feel like a dashboard grid.

---

## 14. Focus visual target

C already defines the information contract. D defines the visual direction.

### Running Todo Focus

```text

                 這是代辦喔
                 學習

                  24:15

                  暫停

             結束這段專注

         ← 暫時離開專注畫面

```

### Running Place Focus

```text

              Personal Place 2.0

              上次做到
      Today hierarchy 已完成，
          下一步處理 sidebar。

                  24:15

                  暫停

             開啟工作環境

         ← 暫時離開專注畫面

```

Rules:

- no sidebar;
- no history card;
- no phase tabs;
- no settings accordion;
- no Today warnings;
- no stats;
- no giant framed container around the entire Focus content;
- use empty space as the main separating device;
- the selected work title is equal to or more important than the timer.

---

## 15. Page visual target

Page remains the spatial / launcher side of Personal Place, but normal mode should feel like a personal desk rather than an asset-management grid.

### Keep

- icon / image preview where useful;
- title;
- spatial grid;
- variable card size where it adds real value;
- Page identity.

### Hide by default

- repeated `LOCAL`, `WEB`, `APP`, `TOOL` labels;
- technical subtitles that merely repeat what the icon already communicates;
- move / delete / group / administrative controls;
- launch-enabled metadata;
- unnecessary arrows / open indicators when the whole surface is already clickable.

Reveal maintenance information in organize mode or detail views.

### Card density

Cards may become smaller and quieter than v1.9.

A launcher tile does not need a 190 px tall presentation simply to open Discord.

Large visual cards remain justified for content that benefits from preview or spatial prominence.

### Organize mode

Entering `整理` may reveal:

- drag handles / selection state;
- metadata;
- move / delete;
- grouping;
- resize;
- repair controls.

The difference between normal use and organization should be obvious.

---

## 16. Place visual target

Place should feel like entering a working scene.

Priority:

```text
Place title
current / recent continuation context
primary continue / open-work action
work contents
administration only when editing
```

The existing concept of `resumeNote` remains valuable, but normal language should emphasize **上次做到** rather than `接續點` as a system noun.

The content grid can remain, but should inherit the quieter Page card system.

Do not show content count / metadata with stronger visual weight than continuation context.

---

## 17. Todo visual target

Todo is allowed to be denser than Today because the user intentionally entered a management workspace.

The existing multi-pane concept may remain:

- Lists;
- item list;
- optional inspector.

But hierarchy should become quieter.

### Keep

- clear list ownership;
- filters;
- search;
- inspector for editing;
- hover / focus action reveal;
- plannedFor and dueAt as separate metadata.

### Reduce

- simultaneous filter prominence;
- red treatment across entire overdue rows;
- always-visible row management controls;
- repeated pills for every metadata value.

Todo is the place where management is allowed. It still should not feel like a spreadsheet wearing neon armor.

---

## 18. Calendar, Activity and Settings

These are intentionally entered support / review workspaces. They can remain more information-dense than Today.

### Calendar

Keep agenda structure and source management, but use the same typography / surface rules. Empty states should be compact.

### Activity

The current review concepts may remain, including period selection, ranking and timeline.

However:

- Activity remains review, not judgment;
- large total-time presentation should not become a productivity score;
- accent bars should remain subdued;
- no new red/green good-vs-bad classification.

### Settings

Settings is already closer to an acceptable density model than the normal Dashboard.

Do not redesign Settings into a giant sparse showcase. Configuration pages are allowed to be practical.

Apply shared typography, spacing, button and surface tokens, then leave it relatively dense.

---

# UI death / demotion ledger

This section is intentionally explicit. The implementation handoff should not quietly resurrect these patterns.

## DELETE from normal product navigation / presentation

### Global `整理` navigation item

Reason: edit state, not destination.

Replacement: contextual Page / Place organize mode.

### Empty Calendar hero / large Today surface

Reason: absence of an event is not primary content.

Replacement: nothing, unless there is a useful time constraint.

### Persistent Focus phase tabs during active Focus

Reason: active Focus should remove choices.

Replacement: phase choice only at transition / setup.

### Focus history and settings inside active Focus Mode

Reason: review and configuration compete with current work.

Replacement: Settings / later review surface.

### Repeated card type labels in normal Page mode (`LOCAL`, `WEB`, `APP`, `TOOL`)

Reason: metadata repetition creates visual noise without helping ordinary launch behavior.

Replacement: organize/detail context when needed.

### Decorative per-card glow blobs as a normal card identity

Reason: turns spatial organization into visual competition.

Replacement: restrained selected / hover treatment.

### Continuous edit-mode pulse / wobble

Reason: the user already knows they entered edit mode; constant motion is noise.

Replacement: stable edit-state chrome / selection handles.

---

## REMOVE / DEPRECATE from normal Page composition

### Focus widget card

Current implementation duplicates Focus state and exposes timer controls inside the Page grid.

2.0 Focus is an application state, so the normal Page should not host another miniature Focus control center.

Existing persisted Focus widgets require a safe compatibility strategy during implementation, but the target product should stop encouraging creation / use of this widget.

### Usage widget card

Usage belongs to review / Activity rather than normal Page attention.

Do not keep usage bars beside launch targets simply because the widget already exists.

Existing persisted Usage widgets require compatibility handling rather than destructive data loss.

### Todo widget card

Decision: **demote rather than immediately delete.**

Todo is core workflow and a list-specific shortcut can still be useful inside a personal space.

However, it must not become a second competing Today.

In 2.0 it should behave as a quiet contextual shortcut / small list preview, not a large dashboard module.

Re-evaluate after the main 2.0 IA implementation.

---

## DEMOTE

- Page technical subtitles;
- card open arrows;
- Calendar / Activity sidebar weight;
- Today due / overdue details until explicitly expanded;
- destructive actions;
- move / reorder controls outside organize mode;
- Focus session counts / statistics outside dedicated review;
- status strips that only restate healthy normal state;
- English eyebrow labels where the Chinese heading already communicates the concept.

---

## KEEP and strengthen

- Today as default entry;
- explicit planned Todo intent;
- Place continuation context;
- Page spatial organization;
- quiet launcher icons / previews;
- strong keyboard focus indicators;
- color-theme choice, with reduced decorative use;
- local-first / private character;
- clear error / unavailable states;
- Todo inspector pattern;
- Activity as optional retrospective review;
- Settings / backup / recovery functionality.

---

## 19. Responsive behavior

Desktop is the primary target, but narrow-window behavior must not collapse into unreadable dashboard density.

Rules:

- Today and Focus preserve comfortable line length;
- sidebar may become temporary / collapsible navigation;
- Page grid reduces columns rather than shrinking cards into illegible tiles;
- Todo multi-pane layout may collapse inspector or lists into deliberate secondary views;
- action labels must not wrap into vertical Chinese characters;
- destructive / maintenance actions remain discoverable by keyboard and touch-like pointer interaction, not hover-only with no fallback.

---

## 20. Accessibility contract

2.0 visual reduction must not mean reduced usability.

Preserve / require:

- visible keyboard focus rings;
- sufficient contrast for muted text;
- semantic states that do not rely only on color;
- accessible labels for icon-only controls;
- `prefers-reduced-motion` support;
- logical focus order when navigation hides / Focus Mode enters;
- no hover-only action without focus / keyboard equivalent;
- reasonable text scaling without clipped layouts.

---

## 21. Implementation architecture guidance for later Luna handoff

Do not implement 2.0 by appending another several thousand lines of overrides to `styles.css`.

The current stylesheet already contains historical layers and theme overrides.

The implementation pass should first identify a small token layer for:

- color;
- surfaces;
- typography;
- spacing;
- radius;
- motion;
- width / layout constraints.

Then migrate major surfaces deliberately.

Do not globally rename every existing class or rewrite all components merely for aesthetic purity.

Prefer staged component-level migration with regression tests.

Architecture and domain behavior from 1.9 should remain intact unless A/B/C explicitly require navigation / presentation changes.

---

## 22. 2.0 visual acceptance test

The redesign passes D only if a reviewer can answer yes to the following:

- Can I identify the primary action in under a few seconds?
- Does empty space feel intentional rather than unfinished?
- Are most normal information groups separated without large bordered cards?
- Does Today feel calmer than v1.9?
- Does Focus feel substantially quieter than Today?
- Does Page feel like a personal space rather than a system dashboard?
- Are technical / administrative details hidden until needed?
- Does accent color guide attention rather than decorate everything?
- Are overdue / history / usage data present without judgmental pressure?
- Can the interface remain usable at narrow desktop widths?
- Are keyboard and accessibility states at least as strong as v1.9?
- Have legacy widget / dashboard patterns stopped competing with the new workflow?

---

## 23. Product principle added by D

A: reduce the cost of starting.

C: reduce the cost of staying with the decision.

D adds the visual equivalent:

> **Every visible element spends attention. Personal Place should spend the user's attention only on what helps them decide, continue, work, or intentionally review.**

The redesign is successful when the product feels quieter not because it contains less capability, but because capability waits until it is useful.

---

## Final design-sequence status

```text
A — Product narrative                RESOLVED
B — Today / Home IA                  RESOLVED
C — Real Focus Mode                  RESOLVED
D — Visual system + UI deletion      RESOLVED

Next:
Implementation architecture review
→ staged Luna handoff
→ validation against A / B / C / D
```

Do not start by asking Luna to "make the app prettier".

The implementation handoff must preserve these product contracts and explicitly list what is removed, demoted, retained, and migrated.