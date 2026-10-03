# Design system: ticketing app

Read this before writing any UI code. If a choice is not covered here, pick the option that is quieter and denser, not the one that looks more "designed".

## 1. What this product is

A ticketing system for professional use. Agents sit in it for hours, so the job is **scanning a queue fast, reading a thread, and acting without hunting**. Requesters use a much smaller slice: create a ticket, see its status, reply.

Design for the agent first. Everything else is a simplified view of the same system.

The one memorable element is the **SLA clock** (section 6). Everything else stays quiet so the clock reads instantly.

## 2. Color

Cool, slightly green-tinted neutrals, one accent, and status colors that mean something. Do not use pure `#000` or `#FFF` for large surfaces.

### Neutrals (light)

| Token              | Hex       | Use                                    |
| ------------------ | --------- | -------------------------------------- |
| `--bg`             | `#F3F4F2` | App background                         |
| `--surface`        | `#FBFBFA` | Panels, thread, table rows             |
| `--surface-sunken` | `#E9EBE8` | Filter bars, hovered rows, code blocks |
| `--line`           | `#D9DCD7` | Borders and dividers                   |
| `--ink`            | `#1C2320` | Primary text                           |
| `--ink-muted`      | `#5B655F` | Secondary text, timestamps             |
| `--ink-faint`      | `#8A938D` | Placeholders, disabled                 |

### Accent (use sparingly)

| Token           | Hex       | Use                                                            |
| --------------- | --------- | -------------------------------------------------------------- |
| `--accent`      | `#2B4FD8` | Primary button, focused input ring, selected row marker, links |
| `--accent-soft` | `#E4E9FB` | Selected row background                                        |

The accent appears on at most one filled element per screen region. If everything is blue, nothing is.

### Status and priority (semantic, never decorative)

| Token           | Hex       | Meaning                                              |
| --------------- | --------- | ---------------------------------------------------- |
| `--st-open`     | `#2B4FD8` | Open                                                 |
| `--st-progress` | `#B7791F` | In progress                                          |
| `--st-waiting`  | `#6B7280` | Waiting on customer                                  |
| `--st-resolved` | `#2F7D4F` | Resolved, closed                                     |
| `--danger`      | `#C0392B` | SLA breached, Critical priority, destructive actions |
| `--warn`        | `#C77D0A` | SLA at risk                                          |

Rules:

- Status is shown as a small filled dot plus text. Never color alone (colorblind users, and it fails in grayscale).
- Red is reserved for breach, Critical, and destructive actions. Do not use red for anything else.
- Resolved and closed tickets fade toward `--ink-muted`. Active work gets full contrast.

### Dark mode

Build both. Dark is `--bg #121715`, `--surface #181E1B`, `--line #2A332F`, `--ink #E6EAE7`. Re-check every status color for contrast on dark; lighten them by about 10 to 15 percent instead of reusing the light hex.

## 3. Typography

One family: **Schibsted Grotesk** (Google Fonts). Fallback: `ui-sans-serif, system-ui, sans-serif`. Do not use Inter, Roboto, or Poppins.

- Enable tabular numerals (`font-variant-numeric: tabular-nums`) everywhere numbers line up: ticket IDs, counts, timers, table columns. This replaces any need for a monospace face.
- No monospace "tech" font for labels. Use mono only for actual code, logs, and stack traces inside ticket content.

### Scale (px / line-height / weight)

| Role                         | Size    | Weight |
| ---------------------------- | ------- | ------ |
| Page title                   | 22 / 28 | 600    |
| Ticket subject (detail view) | 18 / 26 | 600    |
| Section heading              | 14 / 20 | 600    |
| Body, thread text            | 14 / 22 | 400    |
| Table cell, UI label         | 13 / 18 | 450    |
| Meta (timestamps, IDs)       | 12 / 16 | 400    |

Rules:

- Sentence case everywhere. No ALL CAPS labels, no tracked-out eyebrows above headings.
- Thread text max line length is about 72 characters. Do not stretch messages across a wide pane.
- Left-align all text. Right-align only numeric columns.
- Do not highlight a single word of a heading in a different color or italic.

## 4. Layout

Desktop is a three-pane workspace. Panes are separated by 1px `--line` borders, not by gaps, shadows, or cards.

```
+----------------+---------------------------------+------------------+
| Views          | Queue                           | Ticket           |
|  Mine (12)     | [filter bar]                    | subject, SLA     |
|  Unassigned    | #4821 Cannot log in    High  2h | ---------------- |
|  At risk (3)   | #4820 Invoice wrong    Med   5h | thread           |
|  All open      | #4819 Export fails     Crit  0h | ---------------- |
|                | ...                             | reply box        |
+----------------+---------------------------------+------------------+
```

- Left nav: 220px, collapsible. Saved views with live counts.
- Queue: a dense table, not cards. Row height 36px (compact toggle at 30px). Columns: status dot, ID, subject, requester, priority, assignee, SLA, updated.
- Ticket pane: subject and SLA clock pinned at the top, thread scrolls, reply box pinned at the bottom. Properties (status, priority, assignee, tags) sit in a right column or collapsible drawer.
- Selecting a row opens the ticket in the right pane without leaving the queue. Keyboard `j` / `k` moves, `Enter` opens.
- Requester portal is a single centered column, max width 640px. Simple, no sidebar.

Mobile: queue becomes a list, ticket opens as a full screen, properties go in a bottom sheet.

### Spacing and shape

- 4px base unit. Use 4, 8, 12, 16, 24, 32. Nothing else.
- Radius by role, not one value for everything: 4px for inputs, badges, buttons; 8px for popovers, menus, dialogs; 0 for table rows and panes.
- Borders carry structure (a row edge, a pane split). Shadows exist only on things that float: menus, dialogs, toasts. Never put a shadow on a table row, panel, or card.
- Do not wrap content in a card just to group it. Use a heading and whitespace first.

## 5. Components

**Buttons**: one primary (filled `--accent`) per view region. Secondary is outlined with `--line`. Tertiary is text only. Destructive is outlined red, filled red only inside the confirm dialog.

**Inputs**: 32px tall in dense areas, 36px in forms. Visible label above the field (not placeholder-as-label). Focus ring is 2px `--accent` with 2px offset.

**Badges**: status is dot plus text, no background pill. Priority uses text weight and a small bar glyph, with color only for High and Critical.

**Tables**: sticky header, no zebra striping, hover uses `--surface-sunken`, selected uses `--accent-soft` with a 2px `--accent` left edge. Sorting arrow only on the active column.

**Thread**: public replies and internal notes must be unmistakable. Internal notes get `--surface-sunken` background, a lock icon, and the label "Internal note, not visible to requester". Do not rely on color alone.

**Empty states**: say what is empty and the next action. Example: "No tickets in this view. Clear the filters or create a ticket."

**Loading**: skeleton rows that match the real row height. No spinners over whole panes.

**Icons**: one set (Lucide), 16px in tables, 20px elsewhere, 1.5px stroke. No emoji in the UI.

## 6. The signature element: the SLA clock

This is the only place we spend visual boldness.

- A thin horizontal segment bar (4px tall, 96px wide in rows, full width of the header in the ticket pane) that fills as time is consumed.
- Neutral gray under 60 percent consumed, `--warn` from 60 to 90, `--danger` past 90 and when breached.
- Next to it, plain text with tabular numerals: "2h 10m left" or "Breached 35m ago".
- It shows first response and resolution as two segments when both apply.
- Paused states (waiting on customer) show the bar hatched in gray with the text "Paused".

Nothing else in the app gets a gradient, glow, or animation.

## 7. Motion

- No page-load animations. No fade-and-slide-up on sections. No hover transforms on cards or rows.
- Motion only answers an action: drawer opens (150ms ease-out), status change flashes the changed value once, toast slides in.
- Respect `prefers-reduced-motion`: remove all of the above except opacity changes.

## 8. Copy

- Sentence case, plain verbs, active voice. Buttons say what happens: "Send reply", "Assign to me", "Resolve ticket". Never "Submit" or "OK".
- One name per action through the whole flow. If the button says "Resolve", the toast says "Ticket resolved".
- Errors say what went wrong and how to fix it, and do not apologize. Example: "Attachment is over 10 MB. Compress it or upload a smaller file."
- Use the user's words: "ticket", "requester", "assignee". Not "entity" or "payload".
- No marketing tone inside the app. No exclamation marks.
- Use real placeholder data when mocking up: realistic subjects ("VPN drops every 20 minutes"), realistic names, mixed priorities. Never "Lorem ipsum" or "Ticket 1, Ticket 2".

## 9. Accessibility floor

- Text contrast at least 4.5:1, UI components at least 3:1.
- Every interactive element has a visible keyboard focus state.
- Full keyboard navigation in the queue and reply box. Show shortcuts in tooltips.
- Hit targets at least 32px on desktop, 44px on touch.
- Status, priority, and SLA are never conveyed by color alone.
- Forms announce errors to screen readers and link them to the field.

## 10. Do not do this (common AI-UI tells)

- Purple or blue-to-pink gradients, glassmorphism, glowing borders.
- Cream background with a terracotta accent, or near-black with neon green.
- Identical rounded cards with the same soft shadow for everything.
- Hero-style big number with a gradient for dashboard stats. Use a plain number with a label and a sparkline only when the trend matters.
- Numbered 01 / 02 / 03 markers on things that are not a sequence.
- ALL CAPS eyebrow label above every heading.
- Arrows appended to every link and button.
- Decorative icons in colored circles beside every list item.
- Scattered hover and entrance animations.
- A dashboard as the landing page. Agents land on their queue.

## 11. Implementation notes

- Stack-agnostic, but written to map onto CSS variables. Define every token above as a CSS custom property on `:root` and a `[data-theme="dark"]` override, and have the component library read from them.
- If using Tailwind or shadcn/ui, override the default theme tokens instead of leaving the stock look, and remove the default shadow and radius from components that are not floating.
- Build the queue table and the SLA clock first. If those two feel right, the rest of the app will follow.

## 12. Self-check before shipping a screen

1. Can an agent tell what needs attention in under three seconds?
2. Is there more than one filled accent element in any region? Remove one.
3. Is anything decorative that carries no information? Remove it.
4. Does it work with keyboard only, in grayscale, and at 200 percent zoom?
5. Would this screen look identical in any other SaaS app? If yes, change something specific to ticketing.
