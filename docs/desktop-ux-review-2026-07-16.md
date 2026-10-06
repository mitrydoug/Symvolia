# Symvolia Desktop UX Review — Pre‑Release

**Date:** 2026‑07‑16
**Scope:** Desktop (SPA) only. Mobile explicitly out of scope for this pass.
**Target user:** A curious, young‑to‑middle‑aged person who is comfortable with modern
websites but has **little or no prior web3 / wallet experience**.
**Method:** Live walkthrough of the running dev app (`localhost:5173`) at 1440×900 using
browser automation (screenshots + accessibility tree), cross‑referenced against the
React/MUI source. Reviewed in **both** the connected (Anonymous + Verified, credits present)
and **disconnected / first‑time‑visitor** states. Also reviewed the **live test site**
(`test.symvolia.org`) with richer, "lived‑in" mock data to see populated feeds, a working
*Similar Statements* panel, and denser real‑world statement cards.

Screens reviewed: Home / ranked feed, Statement detail, Write, How‑it‑works, Get Verified,
Settings, Profile, My Support, My Statements, Starred — plus the persistent shell (left nav
+ right account panel) in both connection states.

---

## 1. Overall impression

The app already has a **coherent, calm visual language** and some genuinely nice touches:
the animated credit odometer, the support‑over‑time area chart, the well‑written
*How it works* page, and a polished, reassuring *Get Verified* flow. The bones are good.

The gap between "works" and "feels polished & approachable" comes down to four themes:

1. **Web3 onboarding is under‑explained on the main UI** — the very thing our target user
   is least familiar with is the thing the interface assumes they understand.
2. **Several core controls are cryptic** — the compact vote control, the credit coin, the
   rank badge, and the peak‑rank trophy all rely on the user already knowing the model.
   With realistic data this compounds: a single card can carry **six+ unlabeled numeric or
   icon signals** at once (see P1‑6), which is overwhelming for a newcomer.
3. **Disabled states look broken rather than gated** — greyed tabs and buttons give no
   reason, which reads as "this site is half‑finished."
4. **Desktop layout doesn't use the canvas well** — large empty regions, especially on the
   statement detail page, make the app feel sparse rather than spacious.

None of these are structural rewrites. They are mostly copy, affordance, and layout polish.

---

## 2. Prioritized findings

Priority key: **P0** = should fix before release · **P1** = high‑impact polish · **P2** = nice‑to‑have.

### P0 — Approachability blockers for a web3 newcomer

> **The disconnected view is the single most important screen for our target user, and
> today it is the weakest.** A brand‑new visitor (no wallet) lands on a page whose entire
> right third is empty except for an isolated **"Connect Wallet"** button floating in the
> top‑right corner, statement cards that show **no way to interact**, and no explanation of
> what Symvolia is or why they'd connect. (Note: the *extreme* emptiness in the local mock
> env was partly a low‑data artifact — only two statements existed; on the populated test
> site the feed itself fills out. The issues below are the ones that persist regardless of
> how much content is present.) The findings are ordered with this state in mind.

#### P0‑0 · The disconnected experience gives a newcomer nothing to do or understand
**Observed (disconnected Home & Statement detail):**
- The right account column is ~95% empty whitespace with a lone "Connect Wallet" button —
  **this is data‑independent** and remains true even with a full feed.
- Statement cards lose their support/vote control entirely, so there is **no visible
  affordance that the board is interactive** — nothing hints "connect to support this."
- The numbers next to the trophy ("35", "16") are unlabeled and ambiguous.
- ~~Large empty canvas below two cards makes the product feel thin.~~ **Reassessed:** this was
  largely a low‑data artifact of the two‑statement mock env; a populated feed fills the
  vertical space. The vertical‑emptiness concern now applies mainly to the **statement
  detail** page (P1‑3), not the disconnected Home feed.
- A console `400` error fires on load in this state (worth diagnosing separately).

**Why it matters:** This is exactly the person we're designing for, seeing the app for the
first time. Right now they get no value proposition, no orientation, and no obvious action
beyond a bare wallet prompt.

**Recommendation:**
- Fill the empty right column (or a hero band) with a compact value proposition + primary
  action for the disconnected state: one line on what Symvolia is, a "Browse freely — no
  wallet needed to look around" reassurance, and the connect/join CTA with a secondary
  "How it works" link.
- On statement cards/detail while disconnected, show a gentle inline affordance where the
  vote control would be (e.g. a muted "Connect to support" chip) so the interactive nature
  is discoverable.
- Rename the CTA to lead with value rather than the intimidating term — e.g. **"Get
  started"** / **"Join Symvolia"** with "wallet" explained on the next step, instead of
  "Connect Wallet" as the very first word a newcomer reads.
- **Where:** [Root.tsx](frontend/src/components/Root.tsx), [UserProfilePanel.tsx](frontend/src/components/UserProfilePanel.tsx), [StatementCard.tsx](frontend/src/components/StatementCard.tsx), [StatementPage.tsx](frontend/src/components/StatementPage.tsx).

#### P0‑1 · No first‑run orientation for a brand‑new visitor
A first‑time visitor lands directly on the ranked feed with a left nav, a globe icon, a
credit counter, and a "Lock it in!" button — with no framing of *what this site is* or
*what they can do without a wallet*. The *How it works* page answers all of this well, but
it's buried as the 5th nav item and nothing points to it.

- **Why it matters:** Our persona needs a 1‑sentence "what is this + you can look around
  freely" reassurance, or they bounce.
- **Recommendation:** Add a lightweight, dismissible intro — a one‑line banner or a small
  welcome card at the top of the feed on first visit: *"Symvolia is a public board for what
  verified people care about. Browse freely — you only need a wallet when you want to
  support or post."* Link it to *How it works*. Persist dismissal in `localStorage`
  (pattern already used elsewhere, e.g. bookmarks).
- **Where:** [Home.tsx](frontend/src/components/Home.tsx), reuse the storage pattern from `useLocalStorageSet`.

#### P0‑2 · The wallet entry point exists, but lacks framing (and account controls are hidden)
To be precise: a **"Connect Wallet"** button *does* exist in the disconnected state (see
P0‑0). The problem is not its existence but its **framing and context**:

- **Disconnected:** the button appears with no explanation of *why* you'd connect or what a
  wallet even is, and it leads with the intimidating word "Wallet" (CTA wording is covered
  in P0‑0).
- **Connected:** once you're in, the right‑hand panel shows *Anonymous · Verified · Credits ·
  Lock it in / Reset / Write*, but the **account controls (Disconnect, etc.) are hidden
  behind an unlabeled chevron**, so managing your identity/wallet is not discoverable.

For a user who has never used a wallet, this framing gap is the single biggest friction point.

- **Why it matters:** Wallets are the unfamiliar part. This is where hand‑holding matters most.
- **Recommendation:**
  - Keep the explicit **Connect wallet** button when disconnected, but pair it with one line
    of plain‑language reassurance (*"A wallet is your anonymous identity here — free to
    create, no email needed."*) linking to *How it works* / *Get Verified*.
  - When connected, surface a compact, clearly‑labeled account chip and give the
    chevron/expand control a visible label or icon+text ("Account") rather than a bare caret.
- **Where:** [UserProfilePanel.tsx](frontend/src/components/UserProfilePanel.tsx) (`useWalletAuth`, the `Expand menu` control).

#### P0‑3 · Disabled controls give no reason
"Lock it in!" and "Reset" render disabled/grey with no explanation; the **Relevant** and
**Latest** sort tabs are disabled on the ranked feed; **Create** is disabled on an empty
Write form. To a newcomer these read as *broken*, not *not‑yet‑applicable*.

- **Why it matters:** Ambiguous disabled states erode trust in a pre‑release product.
- **Recommendation:** Attach a tooltip / helper text to every disabled control explaining
  the unlock condition — e.g. *"Stage some support first"*, *"Available when searching"*,
  *"Add text to create"*. Consider hiding rather than disabling controls that are never
  relevant in the current context.
- **Where:** [UserProfilePanel.tsx](frontend/src/components/UserProfilePanel.tsx), [SortTabs.tsx](frontend/src/components/SortTabs.tsx), [CreateStatementForm.tsx](frontend/src/components/CreateStatementForm.tsx).

---

### P1 — High‑impact polish

#### P1‑1 · The compact vote control (`× ▾ 7 ▴`) is cryptic
On statement cards and the detail header, support is adjusted via a compact cluster of a
clear‑"×", a down caret, a number, and an up caret. There is no label telling the user this
is how they **support** a statement, nor what the number represents (support units vs.
credits).

- **Why it matters:** This is *the* core interaction. If a newcomer doesn't recognize it,
  the whole app is inert to them.
- **Recommendation:**
  - Add a persistent, quiet label ("Support") next to the control, at least in the detail
    header and on hover in cards.
  - Ensure hover/focus tooltips on the +/−/× buttons ("Add support", "Remove support",
    "Clear").
  - Consider a slightly more button‑like affordance (segmented control styling) so it reads
    as interactive at a glance.
- **Where:** [VoteToggle.tsx](frontend/src/components/VoteToggle.tsx), [SupportVoteControls.tsx](frontend/src/components/SupportVoteControls.tsx).

#### P1‑2 · Rank badge, peak‑rank trophy, and credit coin need inline meaning
The large "2" (rank), the "16 🏆" (peak rank), and the gold "C" coin all assume prior
knowledge. The accessibility tree confirms good tooltips exist for some (e.g. *"Peak rank:
#1"*, *"You have 28 credits providing 7 support"*) — but they're hover‑only and the visuals
alone are ambiguous.

- **Recommendation:** Add subtle text labels ("Rank", "Peak", "Credits") or a small legend,
  at least on the statement detail page where there's ample room. Keep the tooltips.
- **Where:** [StatementCard.tsx](frontend/src/components/StatementCard.tsx), [StatementPage.tsx](frontend/src/components/StatementPage.tsx).

#### P1‑3 · Statement detail page feels empty on desktop
Below the statement header and the (rather small) chart, there is a large expanse of empty
canvas, and "No similar statements found." sits alone. The wide viewport is underused.

- **Recommendation:**
  - Constrain the main content to a comfortable reading column and center it, or
  - Enrich the page: give the chart more height/prominence, add a short "What this means"
    caption, and design a friendlier empty state for Similar Statements (icon + one line +
    a "Write a related statement" CTA).
- **Where:** [StatementPage.tsx](frontend/src/components/StatementPage.tsx), [SupportChart.tsx](frontend/src/components/SupportChart.tsx), [SimilarStatements.tsx](frontend/src/components/SimilarStatements.tsx).

#### P1‑4 · CTA hierarchy favors "Write" over the newcomer's real next step
"WRITE" is the boldest, filled‑blue button in the account panel. But for a just‑arrived,
unverified, wallet‑less visitor, writing is the *last* thing they can do. The visual
hierarchy points them at a dead end.

- **Recommendation:** Make the primary CTA context‑aware: for a new/unverified user, lead
  with **"Get verified"** or **"Connect wallet"**; promote "Write" only once they're able
  to use it.
- **Where:** [UserProfilePanel.tsx](frontend/src/components/UserProfilePanel.tsx).

#### P1‑5 · Empty & loading states are bare
"No similar statements found." and similar messages are unstyled single lines. The app
already has nice skeletons ([StatementCardSkeleton.tsx](frontend/src/components/StatementCardSkeleton.tsx)) — the empty states should match that level of care.

- **Recommendation:** Standardize an empty‑state component (muted icon + short heading +
  one supportive sentence + optional action). Apply to Similar Statements, empty search
  results, empty My Support / My Statements / Starred, and the chart's *"Not enough history
  to chart."* placeholder.

#### P1‑6 · Populated statement cards are information‑dense with unlabeled signals
Seen clearly on the lived‑in test site: a single statement card can simultaneously present a
**rank number**, a **rank‑change indicator** (▲/▼/🔥 + number), a **global support count**, a
**peak‑rank icon** (🏆/medals/⛰️ + number), a **"switch support" merge icon**, a **credit coin
+ amount**, and the **vote stepper** (`× ▾ 15 ▴`). That's six‑plus distinct signals, most
with no text label, and several are *different numbers that look alike* (e.g. global support
"15" sitting next to a vote value of "15").

- **Why it matters:** For a newcomer this is the difference between "I get it" and "this
  looks like a trading terminal." It's the biggest single legibility risk once real data
  lands.
- **Recommendation:**
  - Establish a clear visual hierarchy: lead with the statement text + one primary metric
    (support), and demote secondary signals (peak rank, rank change, switch‑support) into a
    quieter meta row or behind hover/expand.
  - Label or icon‑caption the ambiguous ones — especially the **⛰️ peak‑rank icon** (reads as
    "elevation," not "best rank reached") and the **merge / "switch support" icon**, which is
    an advanced action shown by default with no explanation.
  - Visually distinguish "total/global support" from "your support / staged vote" so identical
    numbers aren't confused.
- **Where:** [StatementCard.tsx](frontend/src/components/StatementCard.tsx) (`MergeIcon` / `onSwitchSupport`, `peakRankIcon`, `rankChangeIndicator`), [SupportVoteControls.tsx](frontend/src/components/SupportVoteControls.tsx).

---

### P2 — Refinements

- **P2‑1 · Forum switcher discoverability.** The globe icon under the logo is the
  forum switcher but doesn't look interactive or labeled. Add a caret/label ("Earth ▾") and
  hover affordance. → [ForumIcon.tsx](frontend/src/components/ForumIcon.tsx), [ChooseForumModal.tsx](frontend/src/components/ChooseForumModal.tsx).
- **P2‑2 · Left‑nav active state.** Verify the current route has a clear selected style
  (background/indicator), not just an icon color shift. → [SideNav.tsx](frontend/src/components/SideNav.tsx).
- **P2‑3 · Accent & CTA contrast.** The muted blue/grey palette is pleasant but primary
  actions could carry more contrast/weight to stand out. → [theme.ts](frontend/src/theme.ts).
- **P2‑4 · Search field prominence.** The search input is visually quiet; consider a
  slightly stronger container and a placeholder that hints scope ("Search statements in
  Earth…"). → [SearchField.tsx](frontend/src/components/SearchField.tsx).
- **P2‑5 · "Version 0.1.0‑dev…" in the nav.** Fine for dev, but confirm it's hidden or
  de‑emphasized in production builds so it doesn't read as unfinished. → [AppVersionLabel.tsx](frontend/src/components/AppVersionLabel.tsx).
- **P2‑6 · Chart sizing bug.** The console logs repeated Recharts warnings
  (`width(-1) and height(-1) … should be greater than 0`) on the statement page — the chart
  container occasionally initializes with invalid dimensions. Worth fixing to avoid layout
  flashes. → [SupportChart.tsx](frontend/src/components/SupportChart.tsx).
- **P2‑7 · Duplicate, differently‑named identity control.** The user's display name can be
  set in **two** places under **two** different terms — *"Display name"* in Settings and
  *"nickname"* in Profile. Unify the terminology and, ideally, the entry point. →
  [Settings.tsx](frontend/src/components/Settings.tsx), [UserProfile.tsx](frontend/src/components/UserProfile.tsx).
- **P2‑8 · Two visual languages for "position" in one list.** Ranked items show a large
  numeral badge (1, 2) while unranked items show a circular progress ring (52%, 38%, 13%).
  Reading a single feed then requires decoding two metaphors; consider unifying or clearly
  captioning them. → [StatementCard.tsx](frontend/src/components/StatementCard.tsx).
- **P2‑9 · Inconsistent sort‑tab gating.** On the ranked Home feed the *Relevant* / *Latest*
  tabs are disabled, but on the Statement detail's *Similar Statements* the same tabs appear
  enabled. Align the behavior (and see P0‑3 re: explaining disabled states). →
  [SortTabs.tsx](frontend/src/components/SortTabs.tsx).
- **P2‑10 · Advanced settings exposed by default.** The **Custom RPC URL** field in Settings
  surfaces raw web3 plumbing to every user. Group it under a collapsed "Advanced" section so
  it doesn't intimidate the target user. → [Settings.tsx](frontend/src/components/Settings.tsx).

---

## 3. Screen‑by‑screen notes

**Home / ranked feed** — Clean. Sort tabs read as broken when disabled (P0‑3). Feed cards
are readable; the vote control is the weak point (P1‑1). No first‑run framing (P0‑1).

**Statement detail** — Nice chart and animated credits, but lots of empty desktop space
(P1‑3), cryptic badges (P1‑2), and a bare empty state (P1‑5). Chart sizing warning (P2‑6).

**Write** — Clear and focused. Char counter (0/120) is good. The inline support stepper next
to the counter is slightly confusing before the statement exists; consider deferring/support
context. Disabled "Create" needs a reason (P0‑3).

**How it works** — Strong. Well‑written, well‑structured, good FAQ. Main issue is
*discoverability* — surface it earlier (P0‑1). Consider linking specific sections from the
relevant controls (e.g. credits explanation from the coin icon).

**Get Verified** — The most polished screen: clear stepper, privacy reassurances,
open‑source framing, FAQ accordions. This is the quality bar to bring to the rest of the app.

**Lived‑in statement detail (test.symvolia.org, real data)** — With realistic content the app
feels markedly more alive, and **Similar Statements** is a genuine strength: the TOP /
RELEVANT / LATEST tabs are all active and surface related statements, which is a real
differentiator and gives the detail page a reason to exist beyond the chart. Two things to
watch: (1) card **information density** becomes the dominant legibility problem here (P1‑6);
and (2) **relevance quality** — under a healthcare statement, "Universal background checks…"
(gun policy) surfaced as "similar," suggesting keyword overlap ("universal") rather than
topical similarity. Worth tuning, though that's search‑quality more than UX. The desktop
empty‑space issue (P1‑3) persists below the two result cards.

**Disconnected / first‑time visitor (Home + Statement detail)** — The critical persona view
and currently the weakest (see P0‑0). Sparse canvas, an isolated "Connect Wallet" button in
a sea of empty right‑column space, no value proposition, and statement cards stripped of any
interaction affordance. The reduced left nav (Home / Starred / How it works) is a reasonable
contextual change, but the overall impression is "empty." A `400` network error also logs on
load in this state.

**Settings** — Clean and well‑labeled; the segmented controls (Light/Dark/System,
Backend/Browser‑local) are a nice pattern. Disabled Save buttons need a reason (P0‑3). The
**Custom RPC URL** field exposes web3 plumbing that should be tucked under "Advanced"
(P2‑10). Content sits in a narrow left column with a lot of empty space to the right.

**Profile** — The **Credit Allocation** donut (Total / Allocated / Staged / Unallocated) is a
genuinely nice summary. Two issues: when no name is set, the page H1 literally reads *"Set
nickname"* — a call‑to‑action masquerading as identity; and the generated identicon avatar is
a colorful pie shape that visually rhymes with the credit donut just below it. Also note the
display‑name duplication with Settings (P2‑7).

**My Support** — Best look at populated cards. Confirms the cryptic vote control (P1‑1) and
exposes the mixed rank‑badge vs. progress‑ring visual language (P2‑8).

**My Statements / Starred** — Both render the same bare *"No statements found."* empty state
(P1‑5). Prime spots for a friendly empty state with a nudge ("You haven't written anything
yet — write your first statement" / "Star statements to find them here later").

---

## 4. Suggested sequencing

A pragmatic pre‑release order:

1. **Trust & clarity (P0):** first‑run intro, explicit connect‑wallet affordance, and
   reasons on all disabled controls. Highest impact for the persona, low effort.
2. **Core interaction legibility (P1‑1, P1‑2):** label the vote control and the
   rank/credit/peak visuals.
3. **Layout & empty states (P1‑3, P1‑5):** tighten the statement page and standardize empty
   states.
4. **CTA hierarchy (P1‑4)** and the P2 refinements as time allows.

---

## 5. How you can help

To let me validate fixes and dig deeper, it'd help to have:

- ~~A way to reach the wallet‑disconnected / unverified first‑run state~~ — ✅ reviewed; folded
  into P0‑0 and the screen‑by‑screen notes.
- Confirmation of the **primary release palette / brand accents** (there's a `branding/`
  folder) so polish recommendations match the intended identity.
- A pointer to any screens I haven't hit that matter for launch (the commit/transaction
  dialogs, forum switcher modal, and the verified‑but‑no‑credits state).

Once you've picked which items to tackle, I can implement them directly and re‑screenshot
each change against the running app to confirm the result.
