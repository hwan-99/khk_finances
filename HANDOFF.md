# Finance Manager — handoff (as of v3.0.12)

Paste this into a new chat (Claude, Codex, whatever) to pick up where we left off.
Written for an assistant with no memory of the previous sessions.

---

## ⚠️ Claude — read this section before doing anything

### 1. Ask for the files first

**Kyung Hwan almost always forgets to attach them. Ask immediately, before any work:**

1. **`index.html`** — the current build (~1.2 MB single file). Without it you cannot patch anything.
2. **`data.json`** — his latest backup (⋮ menu → *Download backup*). Without it you're guessing at his numbers.

If either is missing, ask and wait. Do not reconstruct them.

Then check `APP_VERSION` near the top of `index.html` — it should read **3.0.12** or higher. If it's lower, he's handed you a stale file. Ask again.

### 2. Check whether the feature already exists — and say so

He has explicitly asked for this. Three times he requested things that were already built (subscription end dates, Enter-to-confirm, full-date entry). **Read the code, then say *"this already exists, here's where"* before writing anything.** Only build if it genuinely doesn't exist. There's a list of known-existing features below.

### 3. End every delivered version with exactly one line

He has a self-healing shell function. **Never give him raw git commands** — he has been burned repeatedly by mid-rebase states, detached HEAD, and tags pinned to the wrong commit. Always finish like this:

````
```zsh
fmdeploy "v3.0.3: what changed"
```
````

That's it. One line, with the real version number read from the build you just made.

### 4. Verify by computing, and be honest about what you didn't test

He checks your numbers and has caught real errors. Compute; don't assert from memory. And **jsdom has no layout engine** — it proves structure, never pixels. Say so rather than implying you verified the look.

---

## Who this is for

**Kyung Hwan, Korean MD (b. 1999).** Enlisted **KATUSA 2026-08-24** — **in service now**, discharge **2028-02-23**. Check the real date before
reasoning about "before/after enlistment" (see Scars: the v3.0.3 session got this wrong). Preparing for US neurosurgery residency (LSU Shreveport) and Step 2 CK. Technically fluent, tests everything, wants to be told when he's wrong. Responds well to correction, badly to hedging.

## What this is

A single-file React app (no build step, no server) he uses daily. Started as a finance ledger; now also tracks fitness and study. Data lives in `localStorage`, syncs between his iPhone and MacBook via a Cloudflare Worker with client-side AES-GCM encryption.

---

## The workflow (non-negotiable — it's what keeps the file from breaking)

The app is a **compiled bundle**: `React.createElement(...)`, not JSX. Edit it as text.

**Never trust the line numbers below — DERIVE them.** They were wrong for several versions (the handoff said the
app ended at 4913 when it ended at 6778; following it literally would have truncated 1,865 lines).

```bash
# 1. split. As of v3.0.12: head = 1-342, app = 343-7929, tail = 7930-7931. VERIFY, don't assume:
grep -n '^<script>$' index.html | tail -1     # -> the app script opens here (call it N)
grep -n '^</script>$' index.html | tail -1    # -> and closes here (call it M)
head -342 index.html > head.txt
sed -n "343,${M}p" index.html > app.js
sed -n "$((M+1)),\$p" index.html > tail.txt

# 2. patch app.js with python EXACT-STRING replacements, asserting count == 1
#    never regex-replace; never delete by line range or "from comment to next anchor"

# 3. syntax check
sed '1d;$d' app.js > check.js && node --check check.js

# 4. rebuild
cat head.txt app.js tail.txt > final.html

# 5. test in jsdom, run the smoke suite + __fmSelfTest(), THEN:
cp final.html /mnt/user-data/outputs/index.html   # + present_files
```

The old step 5 ("patch the head's theme bootstrap") is **done** — the head has carried the
`prefers-color-scheme` version since v2.7.5. Don't re-apply it.

**Make patch scripts idempotent.** Use a helper that skips an edit when the new string is already present, instead of asserting and dying mid-loop. A patch that throws halfway leaves `app.js` partially edited (this has happened) and you'll burn a turn working out why it matches neither state.

### jsdom gotchas — each cost real time to rediscover

- Storage key: `fm:fm_data_v3`.
- Boot needs: `ResizeObserver` stub, `fetch` reject, `WebSocket = undefined`, `matchMedia` stub, `scrollTo` stub. Wait ~2600 ms to boot, ~900 ms after actions (400 ms debounced save).
- **`body.textContent` includes the `<script>` source** — assert against `document.getElementById("root")`, or you'll match the Korean translation dictionary and think you found a bug.
- `Line` / `Num` render label+value **with no space** in `textContent`. Strip whitespace before matching.
- Controlled inputs: read `.getAttribute("value")`, not `.value`.
- **React `onBlur` fires on `focusout`, not `blur`.** `FormulaInput` / `RateInput` commit on blur — dispatch `focusout`.
- The flat spending log renders **oldest-first**; a row you flagged may be off-screen.
- The **Subscriptions card is on the Spending tab** (not Plan — this wasted a turn).
- Fake clock: subclass `Date` in `beforeParse` closing over a mutable `simMs`.
- `ResponsiveContainer` can't size in jsdom, so chart SVGs don't render — assert on the absence of placeholder text instead.
- **No layout engine.** Broken CSS passes every assertion. His screenshots are the only pixel check.
- **Account names live in `<input value>`**, not text — a row's `textContent` never contains "장병내일준비적금".
  Match rows on `input.getAttribute("value")`.
- **The version lives in two constants:** `APP_VERSION` and `BUILD_AT` (the footer stamp). Bump both.

**Regression:** `smoke3.js` (boots with his data, clicks every tab, quick-logs, adds an expense) + `window.__fmSelfTest()`. Run both before every `cp` to outputs.
The script does **not** survive between sessions — rebuild it from the gotchas above (v3.0.3 did, as `test/smoke.js`).
**Also diff every tab's rendered `#root` text, old build vs new**, with the footer version normalised: v3.0.3's diff
was confined to the one card it changed, across all ten tabs. That is a stronger guarantee than any assertion list.

---

## Deploying — `fmdeploy`

Already installed in his `~/.zshrc` and `~/.bash_profile`. **You give him the one-liner; he runs it.** For reference, this is what it does — sync to origin *before* writing the file (so a merge conflict in a generated file is structurally impossible), heal interrupted rebases and detached HEAD, read `APP_VERSION` from the file so the tag can't drift, park anything discarded on `fmdeploy-backup`, then verify by reading the version back off `origin/main`:

```zsh
_fmver() { grep -o 'APP_VERSION = "[^"]*"' "$1" 2>/dev/null | head -1 | sed 's/.*"\(.*\)"/\1/'; }

fmdeploy() {
  local REPO="$HOME/khk_finances"; local msg="${1:-update}"; local SRC="${2:-$HOME/Downloads/index.html}"
  cd "$REPO" 2>/dev/null || { echo "✗ no repo at $REPO"; return 1; }
  [ -f "$SRC" ] || { echo "✗ no file at $SRC"; return 1; }
  local v; v=$(_fmver "$SRC")
  [ -n "$v" ] || { echo "✗ can't read APP_VERSION from $SRC — right file?"; return 1; }
  if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
    echo "⚠ interrupted rebase — aborting"; git rebase --abort 2>/dev/null || rm -rf .git/rebase-merge .git/rebase-apply
  fi
  [ -f .git/MERGE_HEAD ]       && { echo "⚠ interrupted merge — aborting";       git merge --abort 2>/dev/null; }
  [ -f .git/CHERRY_PICK_HEAD ] && { echo "⚠ interrupted cherry-pick — aborting"; git cherry-pick --abort 2>/dev/null; }
  if ! git symbolic-ref -q HEAD >/dev/null; then
    echo "⚠ detached HEAD — returning to main (stray commits on fmdeploy-backup)"
    git branch -f fmdeploy-backup HEAD >/dev/null 2>&1
  fi
  git switch main >/dev/null 2>&1 || git checkout main >/dev/null 2>&1 || { echo "✗ can't reach main"; return 1; }
  git fetch origin || { echo "✗ fetch failed — network / gh auth login"; return 1; }
  if ! git merge --ff-only origin/main >/dev/null 2>&1; then
    echo "⚠ diverged from origin — rebasing onto the remote"
    git branch -f fmdeploy-backup HEAD >/dev/null 2>&1
    git reset --hard origin/main >/dev/null || return 1
  fi
  cp "$SRC" index.html || return 1
  if git diff --quiet -- index.html; then echo "= already matches origin/main — nothing to commit"
  else git add index.html; git commit -q -m "v${v}: ${msg}" || return 1; fi
  if git rev-parse -q --verify "refs/tags/v${v}" >/dev/null; then
    echo "⚠ tag v${v} existed — re-pointing it"; git tag -f "v${v}" >/dev/null
  else git tag "v${v}"; fi
  git push -q origin main || { echo "✗ push failed"; return 1; }
  git push -q --force origin "refs/tags/v${v}" || echo "⚠ tag push failed"
  git show "origin/main:index.html" > /tmp/.fmremote 2>/dev/null
  local rv; rv=$(_fmver /tmp/.fmremote); rm -f /tmp/.fmremote
  [ "$rv" = "$v" ] && echo "✓ v${v} live on origin/main · tag v${v} · $(git rev-parse --short HEAD)" \
                   || echo "⚠ pushed, but origin/main reports v${rv} — check manually"
}

fmcheck() {   # read-only: where am I?
  cd "$HOME/khk_finances" 2>/dev/null || { echo "✗ no repo"; return 1; }
  git fetch -q origin 2>/dev/null
  git show origin/main:index.html > /tmp/.fmremote 2>/dev/null
  echo "branch      : $(git symbolic-ref -q --short HEAD || echo 'DETACHED ✗ — run fmdeploy to heal')"
  { [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; } && echo "rebase      : IN PROGRESS ✗ — run fmdeploy to heal"
  echo "in Downloads: v$(_fmver "$HOME/Downloads/index.html")"
  echo "in repo     : v$(_fmver index.html)"
  echo "on GitHub   : v$(_fmver /tmp/.fmremote)"
  echo "ahead/behind: $(git rev-list --left-right --count HEAD...origin/main 2>/dev/null | awk '{print $1" ahead, "$2" behind"}')"
  rm -f /tmp/.fmremote
}
```

Repo: `~/khk_finances` → `https://github.com/hwan-99/khk_finances`

**Phone update:** Push from the old copy → open the new file (opens blank — normal) → re-enter Worker URL/token/passphrase → Pull → Add to Home Screen.

---

## Current state — v3.0.12 (v3.0.6–v3.0.12 deployed 2026-11-07 from Claude Code on his MacBook)

**Tabs:** Overview · Assets · Income · Purchases · Everyday · Totals · Plan · Review · Fitness · Study
(display labels only — the internal ids are still `expenses` / `needs` / `monthly` and every `tab === "..."` check uses those.)

### Recent work (newest first)

- **v3.0.12** — **compact phone header.** CSS only, appended to the v3.0.11 phone block (still last in `CSS`).
  First card moved from y 268 → **134** at 393px. The `.fm-nav` (tabs already `display:none` on phones; only
  `.fm-nav-tools` shows) is `position:absolute` on `.fm-root` (now `position:relative`), aligned to the net-worth
  line (`top: max(13px, safe-area-top) + 17px`); `.fm-icbtn.kbd-hint` (keyboard shortcuts) hidden; `.fm-head-l`
  is a wrapping flex row so 만원 and the FX strip share a line; `.goalbar-foot` hidden (it repeated net worth +
  target); `.ptr-ind` loses its 16px padding on phones (it occupied 16px at height 0 — **still there on desktop**,
  left alone) with the spinner's margin taking its place. Net worth `clamp(23px,7.2vw,30px)`: at ₩108,000,000
  the gap to the icons was −1px at 375 with a flat 30px; now 12/19/29/54px at 360/375/393/430 (`head2.js`).
  Kebab menu checked open at 375. Desktop header/nav element boxes identical to v3.0.11 (45/45); tab text
  identical; 101 self-tests; pull-to-refresh still paints and reloads.
- **v3.0.11** — **phone layout for Purchases and Assets: stacked cards, no sideways tables.** He asked for it
  after the v3.0.10 WebKit audit. **This reverses the v2.2 decision** ("mobile spending log kept as single-line
  rows w/ 660px scroll") — at his request. CSS-first: one `@media(max-width:600px)` block appended as the LAST
  rule set of `CSS` (comment says why it must stay last). Deleted the phone rules it replaces: the 680px
  `.exp-log` min-width + per-column widths (v3.0.2), the "keep accounts a genuine 560px table" block, and the
  phone `.holdings-*` fixed-column block.
  - **Purchases:** each `<tr>` is a grid — `"name name name amt amt" / "date cat pay mo del"`; the thead becomes
    sort chips (only `th.sortable` shown); group rows and the total are flex label-left / figure-right. The ₩
    prefix is hidden in the amount (fixed-width box stranded it from short numbers; FX rows keep their line).
  - **Assets:** account rows are grids by `td:nth-child` — `"drag name name bal" / "drag type type gain" /
    "drag inv basis tools"`; thead hidden; cost basis captioned via new `td.acct-basis[data-l]` (hidden when
    "—", via `:has`); tfoot shows label · balance · gain (basis total hidden on phones).
  - **Holdings:** shares and cost/share are wrapped in `label.hold-f[data-l]` — `display:contents` on desktop,
    so the 7-column desktop grid is untouched — and `.hold-price-cell` / `.hold-val` got `data-l`. Phone grid
    `"tick tick del" / "sh cost cost" / "price val val" / "price gain gain"` (two columns: three side by side
    clipped 0.01774333, 144,950,230, 9.958108). Captions use the existing KO keys (수량 / 주당 원금 / 현재가 /
    평가액 / 원금).
  - **Checks:** WebKit 393px — no page-level sideways scroll, no element past the viewport; controls under 28pt
    on Assets 64 → 22 (the rest are in other cards: FX inputs, pace toggles). **Desktop (1280px) proven
    unchanged:** every element box in both tables identical to v3.0.10 (Purchases 63/63, Assets 416/416 once
    the zero-size `display:contents` labels are excluded on both sides). Rendered text of all ten tabs identical;
    101 self-tests. Screenshots via `shot.js` / `tail.js` (Playwright WebKit, scratch).
  - Header compacted in v3.0.12.
- **v3.0.10** — **live prices for everything, without typing; smoother scrolling.**
  - **Three feeds, one router.** Module-scope `tickerMarket(t)` → `"kr"` (`.KS/.KQ`), `"crypto"` (`KRW-XXX`, Upbit
    market codes), `"us"` (else), `""` (blank) replaced 7 inline regexes (stream keys, US symbol list, holding
    freshness, currency split). Per-feed sorted ticker lists `krStreamKey` / `usStreamKey` / `cryptoStreamKey`.
    One writer `writeLivePrices(map, src, stamp)` for all feeds — the old Korean writer skipped
    `suppressEditRef`, so every Korean price tick counted as a local edit in the sync advisor. `liveSrc`:
    `ws`/`rest` (Finnhub), `naver`, `upbit`.
  - **Korean stocks: Twelve Data removed** (its free plan cannot serve KRX — the code already showed "KR needs
    Pro plan"). Replaced by **his own Cloudflare Worker relay** → Naver's polling API, which refuses browser
    origins (403 "Invalid CORS request") but answers servers. Source: **`relay/worker.js`** in this repo, deployed
    by pasting into the Cloudflare dashboard (no wrangler login on the Mac). It allows only
    `Origin: https://hwan-99.github.io` (403 otherwise), takes `?codes=005930,…` (≤50, `[0-9A-Z]{6}`), returns
    `{code:{price,at,open}}`. `price` = `closePriceRaw` = **KRX** price (NXT after-hours is `overMarketPriceInfo`,
    deliberately ignored). App: URL in `localStorage.fm_relay` (old `fm_td` is deleted on load), entered on the
    Assets chip; synced as `_relayUrl` where `_tdKey` used to travel (import/export/push/pull also still strip
    legacy `_tdKey`). Polls each minute while `krxOpen()`, else one answer then rests. Yahoo was tested and
    rejected: no CORS and already 429 from a server.
  - **Crypto: Upbit public ticker** (`api.upbit.com/v1/ticker?markets=KRW-BTC,…`) — KRW, 24/7, no key, sends
    `Access-Control-Allow-Origin: *`, so no relay. Polls every 30 s. Chip appears only when crypto is held.
  - **Finnhub off-hours fix (his "Finnhub isn't working")**: `pollQuotes` returned before fetching whenever
    `usMarketOpen()` was false — i.e. all of the Korean daytime and weekends — so prices never refreshed even to
    the last close. Now one quote round when shut (`gotClose`), then rest until the open.
  - Per-holding dot: one `livePip(mkt, h, fresh)` helper replaced a 3-deep ternary that still read the deleted
    `isKR` (would have thrown on the Assets tab — caught before boot testing, `node --check` can't see it).
  - **Feed test harness `feeds.js`** (fakes Finnhub/relay/Upbit by URL, sets `fm_live`/`fm_finnhub`/`fm_relay`):
    Sat 16:30 KST → Finnhub 3 calls (one round, 3 US tickers) then silent over 30 s, relay 1, Upbit every 30 s,
    Twelve Data 0; all 10 holdings priced (incl. 005930.KS inside NASDAQ); `fm_last_local_edit` untouched;
    `_relayUrl` not in saved data. Tue 11:00 KST → "🔒 Naver · KR live".
  - **Crypto account (data, `data-2026-11-07-crypto.json`)**: `Crypto` · `Crypto (Upbit)` · invest, holdings
    KRW-BTC 0.01774333 @ ₩144,950,230 / KRW-ETH 0.14620227 @ ₩6,212,281 / KRW-DOGE 500 @ ₩612.9 (Upbit's displayed
    averages; cost ₩3,786,599 vs Upbit's 매수금액 sum ₩3,786,593). **`startingBalance` 9,750,000 → 12,536,593**: his
    가계부 shows ₩700k (Mar) + ₩300k (Apr) of crypto bought after the 2026-03-04 baseline, never logged as spending;
    the other ₩2,786,593 predates it. Verified: net worth +₩2,335,270 (= value), residual −₩451,323 = real crypto
    loss −₩1,451,329 + the ₩1M phantom loss that unlogged buy had been booking. Same file carries the Disney+
    end `2026-08` and the Phone bill split (₩28,500 → 2026-10, new ₩48,900 row from 2026-11; Nov assumed).
  - **Smoothness.** Pull-to-refresh kept a **non-passive `touchmove` on window permanently**, so every scroll
    on every tab waited on the main thread, and it `setPtr`'d per touchmove (whole-app re-render ~60×/s, plus a
    `height` relayout). Now the non-passive listener is attached in `touchstart` only when the touch begins at
    the top and removed on end / sideways swipe / scroll-away; the band and spinner are painted via refs
    (`ptrIndRef`, `ptrSpinRef`); `ptr` state and `ptrRef` gone. `ptrtest.js` (jsdom, synthetic touches): idle
    blocking listeners 1 → 0, mid-page scroll 1 → 0, band follows the finger (v3.0.9 read 0px mid-pull), full
    pull still reloads. Removed all 6 `-webkit-overflow-scrolling:touch` (no-op since iOS 13; forces layers).
    `will-change:transform` on the Everyday month cells is deliberate (month swipe) — kept.
  - **WebKit audit (`audit.js`, Playwright WebKit 18 at 393×852 ×3, touch)** — first real-layout check this
    project has had. No tab scrolls the page sideways; tab switch 19–61 ms, keystroke 14–30 ms (Mac; phone
    slower). **Not fixed — proposed to him:** tap targets under 28 pt (Purchases 121/160, Income 80/120, Assets
    64/136; Apple's guideline is 44); the Purchases log (min-width 680) and Assets table scroll sideways inside
    their cards on a phone, clipping month totals, dates and names; the header (net worth + FX + goal bar + 5
    icons) is ~⅓ of the first screen on every tab. Screenshots come from `page.screenshot` in that harness.
  - 101 self-tests (+3 `tickerMarket`). With Live off, all ten tabs byte-identical to v3.0.9.
- **v3.0.9** — two things he asked for.
  - **Plan's "Post-service projection" breakdown sums the months the projection actually runs.** `idealProj`
    starts at `projStart` (= `snapshotMonth`, or the earliest pending income month), so once service is under way
    its first service month is NOW, and `svcStartBal` is today's balance — which already contains every earlier
    service month. The breakdown summed income/living from `SERVICE_START` (Sep) instead: Sep+Oct counted twice,
    "(16 mo)" sitting over 18 months of sums, the growth plug absorbing the overlap. The engine now also returns
    `svcFrom` (first service month it iterates) and `svcAtStart`; the breakdown loops
    `monthsBetween(svcFrom, dischargeYM)` (inclusive; length === `svcMonths`, self-tested). Labels follow:
    "Balance now" / "Now → discharge" when `svcFrom > SERVICE_START`, unchanged otherwise (+KO "현재 잔액").
    His 11-07 data: income ₩20,833,334 → **₩18,600,000** (unreceived Nov–Feb rows), living ₩10.8M → **₩9.6M**
    (₩600k × 16), growth ₩5,490,924 → ₩6,524,258; **discharge total unchanged** (₩98,904,533). Removed dead
    `contribTotal` (computed, never read, same wrong window).
    **Pre-service check:** a copy of his data with `snapshotMonth = "2026-08"` and Aug+ income unreceived, clock
    2026-08-10: v3.0.8 and v3.0.9 render identically ("Service start", "(18 mo)", ₩20,293,540 = hand sum).
  - **Header: the "Before service" goal bar is hidden once enlisted.** `!trajPost && GoalBar(goalAug)`, and the
    discharge bar is un-muted (`muted: !trajPost`) — the same predicate that rolls the Trajectory card (v3.0.5), so
    the two cannot disagree. The goal itself is untouched (goals are positional; deleting goal 0 breaks the app).
    He asked for the exact 2026-08-24 net worth as a permanent record instead; **it is not recoverable**: nearest
    are the 08-13 snapshot (₩71,059,655) and the 2026-08 auto-close of 09-03 (₩69,140,701) whose holdings prices
    are `asOf 2026-08-21` — last edit ~3 days pre-enlistment; 08-21→08-24 spending and prices were never logged.
    He chose deletion over an estimate. Before enlistment (clock 2026-08-10) Overview is byte-identical to v3.0.8.
  - 98 self-tests. Tab diff vs v3.0.8 at 2026-11-07: the header line on every tab + the Plan breakdown; nothing else.
- **v3.0.8** — **the 적금 payout no longer double counts.** `ServiceSettle`'s *Record payout* credited the chosen
  account but left the 적금 (`balance` + `autoContrib` deposits, ₩9.9M by maturity) standing, so net worth counted
  the deposits twice. New module-scope `settleJeokPayout(accounts, targetId, amount)` drains the 적금 (balance 0,
  `autoContrib` null) THEN credits the target (order matters if the target is the 적금 itself) and returns
  `jeokPrev` = the 적금's prior `{id, balance, autoContrib}`, stored on the `history` maturity entry.
  `undoJeokPayout(accounts, entry)` debits the target and restores `jeokPrev` exactly; entries without `jeokPrev`
  (none exist in his data) undo as before. Panel note now says "recording it empties the 적금 account".
  **End-to-end at a faked 2028-02-25 with his 11-07 data:** v3.0.7 net worth +₩20,158,540 (the whole payout);
  v3.0.8 **+₩10,258,540** = payout − ₩9,900,000 deposits (match ₩9.9M + interest ₩358,540); undo restores every
  account byte-identical in both. 7 new self-tests (97). Tab diff vs v3.0.7 at 2026-11-07: all ten identical
  (the panel lives in the Periods modal). Harness: `payout.js` — boots, opens `button[title="Periods"]`, clicks
  `.pd-settle-go`, then `.pd-undo`; compare undo against the app's saved state after boot, NOT the raw file
  (`normalizeData` reshapes accounts on load, so the raw-file comparison is always false).
- **v3.0.7** — **the projection no longer subtracts Purchases twice.** Service months were
  `pay − svcLiving − expByMonth[m] − 적금 − 청약`, but `dailyBudget` counts every Purchase inside the same ₩600k
  (needs rows + fun) except `noPace` items and `plan.excludeCats`. New module-scope `isOffBudgetPurchase(x, plan)`
  encodes exactly those two exits; both `expByMonth` builders (the `idealProj` engine and the Plan tab's
  service breakdown) now collect only off-budget purchases. **The post-discharge branch reads the same
  `expByMonth`, so it changed too** (same double count against `living`; no effect on his data — his horizon
  ends 2028-02). His 11-07 data: discharge ₩98,651,996 → **₩98,904,533** (+₩252,537, the figure measured in the
  v3.0.6 session), short 934만원 → 909만원; Plan "− Service living" ₩11,734,513 → ₩10,800,000 (= ₩600k × 18) and the
  growth plug moves by the same ₩934,513 less ₩252,537. Tab diff vs v3.0.6: only Overview (Trajectory, Ideal
  projection) and Plan (breakdown). His service-era purchases have no `noPace`/Career rows, so all were in-budget.
  **Also fixed: `__fmSelfTest()` returned before half its tests counted.** `const ok = results.every(...)` sat
  mid-function, so every test added after it (acctBalanceAt, svc* from v3.0.3+, this version's) printed ✓/✗ but
  could not fail the return value — proven by breaking one on purpose: v3.0.6 returned `true`, v3.0.7 `false`.
  `ok` now sits directly above the results loop. 90 self-tests.
  **Pre-existing quirk, not fixed:** the Plan breakdown labels its income line "(16 mo)" (`idealProj.svcMonths`)
  but sums 18 months from `SERVICE_START`, with Sep/Oct (already received, so absent from `earnByMonth`) at the
  ₩1,116,667 average. The growth plug absorbs it, so the total reconciles; the line items don't.
- **v3.0.6** — Plan tab's `Investable ≈` line prints its own arithmetic: "−₩133,333/mo (₩1,116,667 pay − ₩1,250,000:
  living ₩600,000 + 적금 ₩550,000 + 청약 ₩100,000)". He read "−₩133,333 after 적금 + 청약" as a claim about the 청약
  amount. Text only; tab diff vs v3.0.5 = that line.
  **Data delivered the same day: `data-2026-11-07.json`** = his 11-07 morning backup + 27 Everyday entries
  (₩407,451, grid cells as `{f:"a+b+…"}` formulas + matching `needsLog` rows, new `Nov` column) + 9 Purchases
  (₩542,697; 비젠마스터피스 ₩221,450 ×3 Hobby) + a new `Claude Pro` sub (₩29,546 from 2026-10; the old one ended 2026-05)
  + 적금 `autoContrib.end = "2028-02-23"`. Sources reconciled: Toss feed (KB card + KakaoPay + KB transfers) and the
  현대카드 ZERO Edition3 October list (₩158,291, matched to the won; the ₩244 over it on the 11/1 bill ≈ overseas fee on
  the Popeyes charge). Excluded at his word: Amazon ₩70,749 and 11/4 ₩6,500 (reimbursed), subscriptions, own-account
  moves. **Unexplained: KB October statement ₩685,864 vs ₩678,366 itemised (₩7,498)** — Oct 12 shows a net +₩8,534
  with no detail. App Store $9.99 (10/13) treated as the existing "Apple / iCloud" sub (= iCloud+ 2TB US price).
  Oct after import: ₩840,385 all-in (Everyday ₩392,741 · Purchases ₩274,000 · Shaving install ₩18,208 · subs ₩155,436).
- **v3.0.5** — two of the v3.0.3 findings, with his sign-off.
  - **The 적금 government match is in the projection.** At the discharge month `idealProj` adds `jeokMatch` to the
    적금 bucket = the 적금 account's principal **on its maturity date** (`acctBalanceAt(acct, dischargeDate)` — new
    `asOf` param on `countMonthlyDeposits`, honours `autoContrib.end`), so it counts exactly the deposits the Assets
    tab and Service dashboard count. Fallback without a schedule: current balance + `jeokMonthly × svcMonths`. Skipped
    once a maturity is recorded (`jeokSettled`). His data: ₩9,900,000 → discharge ₩89,004,533 → **₩98,904,533**,
    shortfall 1,899만원 → 909만원. Plan breakdown shows it as its own line; the note that called his ₩1.5M 병장 pay
    "the match" now states the match; Overview's "match isn't modelled" and the Plan rate hint are corrected (KO too).
  - **Trajectory card follows the live goal.** Once `TODAY >= goals[0].date` it targets goals[1] (₩108M, 2028-02-23)
    with `idealProj` (same engine as the Ideal-projection card): "16 months remaining · ₩98,904,533 · short ₩9,095,467".
    Before enlistment it renders exactly as before (checked at 2026-08-10).
  - **A second copy of the old Investable formula** sat in the Plan tab's service summary (`Investable ≈`) — now
    `serviceIncome − svcCommitted(plan)` with a real minus: −₩133,333/mo at the 18-month average.
  - Known quirk, not fixed: Plan's "적금 … → matures ~₩18,980,420" is `idealProj.jeokEnd` (16 projected deposits +
    interest + match). The ₩1.1M deposited before the projection start lives in net worth, not the bucket, so this
    one label reads ~₩1.3M under the real payout (~₩20.3M). The discharge total is unaffected.
  - Tab diff vs v3.0.4: only Overview (Trajectory, Ideal projection, its note) and Plan (hint, investable line,
    breakdown, note) changed. 86 self-tests. Privacy mode masks every new amount.
- **v3.0.4** — **auto-deposits can end.** `autoContrib.end` (optional): `countMonthlyDeposits(anchor, day, end)`
  stops at `min(today, end)`; `autoEndISO` accepts `YYYY-MM-DD` or `YYYY-MM` (→ last day of month) and treats
  empty/half-typed input as *no end* (DateInput fires per keystroke — a partial value must never zero an account).
  Assets → auto-deposit row gains an **until** field; the result line adds "· stops after X" / "· ended X". For his
  적금, `end: "2028-02-23"` → 18 deposits = ₩9,900,000, where v3.0.3 kept counting (21 / ₩11.55M by 2028-06).
  10 deterministic self-tests (all end dates in the past). Tab diff vs v3.0.3: only the new "until" label.
  **His backup does not carry the end date yet** — set it in the next JSON or he types 20280223.
  Same session: categorised his Toss feed 2026-09-24 → 11-07 for a new JSON (reconciled to the won against
  Toss's day totals: ₩2,597,929 = 36 new rows ₩958,548 + already logged ₩287,100 + subs ₩150,206 + not-spending
  ₩1,202,075). Toss shows internal moves in grey and excludes them from day totals — count only dark rows.
- **v3.0.3** — **Service dashboard accuracy** (Overview, renders 2026-08-24 → discharge). Checked every stat
  against his 2026-11-07 backup:
  - *Served 14% · D−473* — correct (75 of 548 days). Unchanged.
  - *장병내일준비적금 (est. deposited)* — computed `floor(days/30.44) × jeokMonthly`, a second home for a fact the
    적금 account already owns (`balance` + `autoContrib` day 9). **Proven divergence:** from the 9th to ~the 23rd
    of every month the card lagged the Assets tab / net worth by one deposit (Nov 10: card ₩1,100,000, Assets
    ₩1,650,000). Now reads `acctBalance(jeokAcct)`; the old formula is only the no-account fallback.
  - *Investable / mo* — was `serviceIncome − svcNeeds − svcFun − jeok` = **₩-33,333**: the flat 18-month average
    pay (₩1,116,667) instead of this month's Income-tab pay, **missing the 청약 ₩100,000 the projection deducts**,
    and the minus printed after ₩. Now `svcPayFor(month) − svcCommitted(plan)` = **−₩350,000** in Nov 2026
    (일병 ₩900,000 − ₩1,250,000), with a `stat-sub` line: the two terms, and the first month pay covers the
    commitments ("pay covers it from 2027-11" — 병장). Same four outflows as the projection's service month.
  - New module-scope helpers: `isJeokAcct` (now also used by `hasServiceData` — one predicate), `svcPayFor`,
    `svcCommitted`, `svcFirstCovered`; 9 self-tests. 3 KO keys. Privacy mode: amounts mask, sign shows (same as gain cells).
  - **Proven output-identical elsewhere:** all ten tabs' rendered text diffed v3.0.2 vs v3.0.3 — only this card changed.
  - Also in that session: **his logging stopped.** Last Everyday entry 2026-10-24, last Purchase 2026-09-24. October's
    auto-close retro ("₩204,168 vs ₩725,890") and the live "under budget" line are unlogged spending, not thrift.
- **v3.0.2** — Spending-log column widths. The table had **no width rules at all**; auto layout plus
  `white-space:nowrap` let whichever column held the longest content win, starving ITEM — the one column whose
  content is unpredictable — down to "Stanfor"/"Hog Isla", and clipping DATE to `2026-07-0`. Now
  `table-layout:fixed` with explicit widths: date 104 / name auto (min 150, ellipsis) / cat 132 / amt 148 /
  ×mo 44 / pay 88 / del 30, `min-width` 680. **`thead`/`tbody`/`tfoot` each have `display:table`**, so they are
  separate table boxes and the header needs its own matching `th:nth-child()` widths — setting only the
  `.exp-c-*` body classes would leave the header misaligned. **NEEDS EYES — jsdom does not lay out tables.**
- **v3.0.1** — **the Spending-log Amount column never sorted.** The header called `toggleSort("amt")` while
  `sortCaret` and the comparator both expect `"amount"`. So a click set `sortExp.key = "amt"`, which matched
  nothing: the comparator fell through to its `else` branch and silently re-sorted by **date**, the Date
  caret cleared, and Amount's caret stayed `↕` forever. One-word fix (`amt` → `amount`), plus a self-test
  **Scar:** I first added a self-test referencing `SORT_DEFAULT_DIR`, which is component-scoped while
  `__fmSelfTest` is module-scoped — it threw `ReferenceError` at boot and broke the entire app, and I shipped
  it. Anything asserted inside `__fmSelfTest` must be reachable from MODULE scope. `node --check` passes on it
  happily; only booting the file catches it. **Always run a suite that boots the app before presenting.**
  **Note:** sorting uses the FULL ticket price, not the per-month installment slice — so OliveYoung ₩71,720 ×3
  sorts as 71,720, not 23,907. That is a design choice, not a bug; flag it to him if he expected otherwise.
- **v3.0.0** — **the ＋ sheet "background scrolls" bug: root cause finally identified.** It was never an
  overflow/overscroll problem — three rounds of CSS scroll-container fixes (v2.8.5, v2.9.7) missed it entirely.
  `kbLift = innerHeight − vv.height − vv.offsetTop`, and the cap was
  `min(85dvh, calc(100dvh − kbLift − 12px))`. Substituting: `100dvh − kbLift === vv.height + vv.offsetTop`.
  **`dvh` measures the LAYOUT viewport, which the iOS keyboard does not shrink.** So every pixel iOS panned the
  visual viewport grew the sheet by the same amount; its bottom is correctly pinned, so the extra height pushed
  the header, date and amount field off the top of the screen. Confirmed from a screen recording: frame 26 has
  the backdrop still filling the screen while the sheet's top three rows are above the edge.
  Fixed by capping to the **visual** viewport (`vvH − 12px`, tracked from `visualViewport.resize`/`scroll`),
  plus a non-passive `touchmove` handler on the scrim that `preventDefault()`s any drag not originating inside
  `.quick-body`, so the gesture never reaches iOS's visual-viewport pan.
  **NEEDS DEVICE VERIFICATION — jsdom has no visual viewport and no layout engine.**
- **v2.9.9** — **duplicate tickers offer to merge, blending cost AND FX rate.** A position's average cost and
  blended rate are derived from every purchase ever made; maintaining them by hand is not viable for someone
  who trades. Now: `+ Add holding`, type the same ticker, fill shares and cost — a strip appears under that row
  previewing the blend, with **Merge** and a dismiss. `mergeHoldings(target, source)` sums won cost and USD cost
  separately, so `avg $/share = usdTot/shares` and `rate = wonTot/usdTot`; `usdPer * rate === wonTot/shares`
  exactly, so the stored value never disagrees with its own formula.
  **Design note:** his idea, not mine. I proposed a permanent `+ Buy` button on every holding row — that
  widened the grid 22px→48px on a phone to serve an occasional action. Reusing `+ Add holding` adds *no*
  permanent UI; the control exists only while a duplicate does. My one tweak: merge on an explicit confirm,
  because `+ Add holding` commits each field on blur and an automatic merge would fire mid-typing. Because the
  confirm is opt-in, ignoring it keeps the rows as separate lots.
  **Matching is within one account only** — `005930.KS` in ISA and in NASDAQ are genuinely separate positions.
  Selling still needs no arithmetic: average cost is unchanged by a sale, so just lower the share count.
- **v2.9.8** — FX cell tooltip trimmed to `≈₩212,321.2 @1535₩/$` (was a 70-char line that also taught the
  `@` syntax). Names the unit, which "frozen at 1535" never did; EUR cells render `₩/€`. The `@rate` syntax
  is documented here and in the v2.9.6 entry rather than in a tooltip.
- **v2.9.7** — two ＋ sheet fixes. **(a) The scroll leak was mine, from v2.8.5.** Making `.quick-scrim` a
  scroll container gave it something to scroll: when `.quick-body` content FITS it cannot scroll, and
  `overscroll-behavior` is inert on a non-scrolling element, so the swipe chained up to the scrim — which was
  scrollable once the keyboard made the sheet tall — and dragged the sheet AND backdrop together. That reads
  exactly as "the background scrolls instead of the popup". Scrim is now `overflow:hidden` (an inert backdrop),
  `.quick-body` is the ONLY scroller with `overscroll-behavior:contain`, and the page is already frozen by the
  body scroll lock, so a chained swipe moves nothing. **Do not put `touch-action:none` on the scrim** — browsers
  intersect `touch-action` up the ancestor chain and it can disable panning inside `.quick-body`.
  **(b) The amount field takes arithmetic.** `inputMode` was `"decimal"`, which pins iOS to a digits-only
  keypad; now `"text"`, parsed with the existing `calcExpr`. `quickSave` previously did
  `parseFloat(str.replace(/[^0-9.]/g,""))`, which silently turned `12000+3400` into **120003400** — now it
  evaluates. A live `= ₩15,400` hint shows under the field for non-plain input.
- **v2.9.6** — **tapping a USD cost-basis cell silently rewrote it.** `onFocus` seeds a draft, `onBlur`
  commits, and `makeCell` always re-stamped the LIVE rate — so focusing a basis cell and leaving it, with no
  keystroke, moved QQQ from rate 1529 to 1415 and its cost from ₩1,067,677 to ₩988,072/share (₩398k across the
  lot — exactly that lot's FX loss, erased). Proven in jsdom; note React needs `focusin`/`focusout`, not
  `focus`/`blur`, to reproduce. Fixed: `makeCell(raw, prev)` takes the cell being replaced, and `MoneyInput`
  gained `freezeRate`. Precedence: explicit `@rate` > prev's rate > live. **Only the holding BASIS cell passes
  `freezeRate`** — price cells must keep tracking live FX, verified. `usd`/`asOf` now survive an edit too.
  Also added **`$720.6223 @ 1520.2`** syntax in `calcCcy` (`denom`/`wrap`, propagated through +/- as `rx`/`ux`),
  stored verbatim as the formula `f` so it round-trips on re-open instead of collapsing to a number.
- **v2.9.5** — **"Investment gains (residual)" was absorbing all Everyday spending.** `spendingOut` was
  `totalExp + subsPaid`, and `totalExp` reads **only `expenses[]`** (the Purchases tab). The Everyday grid
  lives in `needs.rows x needs.months`, a separate store with **zero** category overlap — so every won of
  Food/Cafés/CVS/Transport left his accounts, was never subtracted as spending, and the residual booked it as
  an investment loss. On his 2026-08 data: residual **−₩18,612,639** vs a real holdings-based loss of
  **−₩8,383,258**; the grid accounted for ₩8,896,632 of the ₩10,254,611 gap. Fixed by adding `everydayOut` at
  **`spendingOut`, not `totalExp`** — the Purchases-tab total (~line 4727) must keep counting `expenses[]`
  alone, and was verified byte-identical after. Result: residual −₩9,716,007, and *Return on contributed
  capital* moved −22.9% → **−13.4%, matching the Assets tab's independent −13.4%**.
  **Still ~₩1.33M unexplained:** ~₩600k is 주택청약 autoContrib deposits made inside the tracked window (they
  leave the ex-savings pool but are never logged as spending), and ~₩758k matches June's `needsLog` to within
  ₩271 — mechanism unconfirmed, deliberately not "fixed" without understanding it.
- **v2.9.4** — **the Quick Add new-day prompt was invisible between 00:00 and 04:00.** `sysToday` was
  `logicalToday()`, which returns YESTERDAY before the 4am cutoff — so `entry.date < sysToday` was false, the
  prompt never rendered, and its confirm button (targeting the same stale value) would have been a no-op even
  if it had. The + sheet was unaffected because v2.8.2 wrote it against `todayISO()`; that asymmetry is what
  made it visible. The prompt now uses `calToday = todayISO()` for its comparison, its text and its button.
  `recapDay` additionally requires `count > 0` so it can never render "across 0 items". The modal prompt was
  also raw English — now `tNodes` with the KO keys, matching the + sheet.
- **v2.9.3** — **privacy mode now masks every amount, app-wide.** v2.9.2 masked only the header and was leaky:
  "Asset composition" and "Where your worth came from" printed the exact net worth one scroll below the dots.
  Masking now happens inside **`won()` / `krMag()` / `compactM()`** — display-only formatters, so one switch
  covers all 259 call sites including today's budget, instead of a component list that drifts. Six sites format
  money with `.toLocaleString` and bypassed the chokepoint (2 Plan goal labels, 2 Review prose, 2 Plan "Lands …
  short of the X target" prose) — all now wrapped in `pv()`. **Found by sweeping the rendered DOM of all ten
  tabs, not by reading source** (`leak.js`); reading the source missed every one of them.
  **Deliberate exception:** editable `num-input` goal targets on Plan stay readable — you cannot type into dots,
  and Plan is a config screen you open on purpose. Stored data, backups and CSV exports are unaffected: privacy
  is display-only (verified — `startingBalance` still 9750000 in storage while masked).
- **v2.9.2** — **privacy toggle.** Module-level `PRIVATE` + `pv(shown, mask)`, assigned during the root render
  like `LANG`/`THEME` so `GoalBar` reads it without prop-drilling. Persisted per-device in `localStorage`
  (`fm_private`), not in `data` — a display preference shouldn't sync. Two entry points: tap the net-worth
  headline, or the eye button in the settings row. **Masks every figure the net worth is derivable from**, not
  just the headline: `.fm-net`, `.fm-net-kr`, and in both goal bars the pct, the value AND the target — a bar
  printing "73.7%" beside "₩93,000,000" gives it away exactly. Bar fill stays (a shape with no target number
  reveals nothing absolute). **Today's budget is deliberately NOT masked** — a spending allowance, not wealth,
  and it's the number he checks in public. Extending it there is a one-line change if he asks.
- **v2.9.1** — **treadmill vs outdoor runs, with a flat-ground estimate.** Cardio rows gain `surf` ("tm" or
  absent = outdoor) and `incl` (% grade, clamped 0–15). Absent `surf` means outdoor, so every pre-2.9.1 workout
  keeps its exact meaning. Conversion is **ACSM** (`VO2 = 0.2S + 0.9SG + 3.5` → equal-VO2 flat speed
  `S(1+4.5G)`) with the **Jones & Doust (1996) 1% convention**, so the outdoor-equivalent factor is
  `1 + 4.5(G − 0.01)`: at 0% it is 0.955, i.e. **a flat treadmill flatters you ~4.5%** — the conservative
  direction, deliberately. `roadEquivSecs(w)` is the single source; `aftValue` calls it so readiness scores the
  converted time, badged `(treadmill → flat)`. **This is metabolic equivalence, not race equivalence** — above
  `TM_TRUST_MAX_PCT` (4%) the row tag turns gold with a tooltip saying so, because a 5% incline run at his
  current pace scores 18:13 (beating his 18:30 goal) while he almost certainly cannot run 10.6 km/h on flat.
- **v2.9.0** — **reversed v2.8.9 (A): Health is Purchases-only again.** He changed his mind. Because v2.8.9
  had already written the Health row + `rev 6` into saved data, deleting code wasn't enough — `removeHealthRow`
  (gated `rev < 7`) actively removes it, but ONLY if the row is empty; a Health row with any logged grid cell
  is kept so no data is lost. De-dupe at both entry surfaces reverted (no collision without the row). Health's
  12 tagged expenses and its Purchases-category status are untouched throughout. **v2.8.9 (B) — the Sep-1 era
  switch — is KEPT.** `건강` stays in the KO dict (harmless; Health is still a shown category).
  *Lesson: a rev-gated migration that mutates saved data can't be undone by reverting code — it needs an
  equal-and-opposite migration at the next rev.*
- **v2.8.9** — two changes. **(A) Health is now an Everyday row.** `ensureHealthRow` (in `normalizeData`, gated
  `rev < 6`) inserts a "Health" grid row after CVS/Pharm exactly once; the 12 existing `cat:"Health"` expenses
  count toward the ₩1.5M budget retroactively via the name-join — no expense rewritten, no grid cell seeded
  (expenses stay the single source of truth; the Everyday-tab pace bar fills once logged through the grid).
  Health stays a Purchases category too (dual citizen, like Food). Both entry surfaces (`quickTargets`,
  `entryLogCats`) now `dedupeCatsAgainstRows` so Health appears once, not twice. **(B) The daily card flips to
  the service budget on the MONTH boundary, not the enlistment day.** The call-site swap was gated on `__inSvc`
  (flips Aug 24); it now uses new `__svcBudgetEra` (flips Sep 1 = `__svcPaceStart`), so all of August — incl.
  the post-enlist week — stays on the ₩2.5M pre-service budget and matches the projection. `__inSvc` still
  drives ServiceCard (a genuine day-one thing). This fixed a pre-existing bug, not just my own.
- **v2.8.8** — Body card weigh-in row rebuilt. It reused `.quick-save` (the log-sheet Save button, `flex:1`)
  dropped into a `flex-wrap` row with a tiny `kg` box and a `margin-left:auto` height field — a secondary
  action dominating a mostly-display card, units stranded at both ends. Now: `kg` + `Log weight` are one
  bordered input group (`.body-log-group`, button sized to its label); **height moved up into the BMI stat's
  `stat-sub`** where it belongs (it's what BMI is computed from, not a sibling of the log action); the KSSO
  category ("obese"/비만 — correct cutoffs, see v2.7.9) now trails the height in muted `.bmi-cat`, not a bare
  red word. Editing height still recomputes BMI live.
- **v2.8.8** — Body card row rebuilt (an earlier write-up of the same change). Height was trapped in the log-weight row (floating past the button it
  had nothing to do with); it now lives as a caption under the BMI stat it feeds, as a `<label>` so tapping
  "height" focuses the field. The BMI verdict (저체중/정상/과체중/비만 — KSSO cutoffs 18.5/23/25, **not** WHO)
  moved inline beside the number in gold (`--gold`, a verdict not an alarm). kg field got an example
  placeholder (`73.5`) + an in-border `kg` suffix; button shrank `Log weight` → `Log` (기록). One language per
  label — English in the string, Korean in the `KO` dict, never both at once.
- **v2.8.7** — dead cream under the Save button: `padding-bottom: calc(16px + env(safe-area-inset-bottom))`
  (~50pt) exists to clear the home indicator, which only matters when the sheet is on the screen bottom. Once
  `kbLift > 0` the keyboard is covering the home indicator, so it is now `paddingBottom: kbLift ? "16px" : void 0`.
  ＋ sheet series (v2.8.2 → 2.8.7) done: day rule, dvh cap, scroll containment, cap arithmetic, safe-area.
- **v2.8.6** — **`calc(85dvh - kbLift)` double-discounted.** v2.8.4's cap took 85% of the *full* screen and
  then subtracted the keyboard, so on an 852pt viewport with a 336pt keyboard the sheet got 388pt when 516pt
  was free — 128pt thrown away, and `.quick-body` (note + logged chips + category chips) collapsed to ~162pt.
  Now `min(85dvh, calc(100dvh - {kbLift}px - 12px))`: 85dvh binds when the keyboard is down, the real
  remaining room binds when it is up. Body 162 → 278pt. `.quick-body` also has `min-height:112px` so it is
  never a slit.
- **v2.8.5** — **the ＋ sheet's scroll chain was never contained.** `.quick-scrim` carried
  `overscroll-behavior:contain` but had **no `overflow`** — and `overscroll-behavior` is a no-op on an element
  that isn't a scroll container. So that line was dead CSS and nothing ever stopped the chain reaching the
  page. `.entry-scrim` (Quick Add — never had this bug) gets it right: **the scrim itself scrolls**, with
  `overscroll-behavior:none`. `.quick-scrim` now mirrors it. Also: `column` + `justify-content:flex-end` +
  `margin-top:auto` instead of `align-items:flex-end` (a flex-end child overflowing a scroll container has its
  top clipped and becomes unreachable), and dropped `-webkit-overflow-scrolling:touch` from `.quick-body` —
  deprecated since iOS 13, forces a compositing layer under an already-transformed parent (the "lag"), and is
  a known way to break `overscroll-behavior` on iOS.
- **v2.8.4** — **fixed the ＋ sheet layout that v2.8.2 broke.** `.quick-sheet` had `max-height:85dvh` AND
  `transform:translateY(-kbLift)`. **`dvh` does not shrink for the iOS keyboard** — that is the entire reason
  `kbLift` exists — so once `max-height` binds, the sheet's top lands `kbLift` px *above* the viewport and the
  header + amount input are simply off-screen, with `overflow-y:auto` turning the sheet into an internal
  scroller that fights the page. It only ever worked because the sheet was short enough that the cap never
  bound; v2.8.2's new-day note + chips tipped it over. Now `maxHeight: calc(85dvh - {kbLift}px)`, and the
  sheet is a flex column: `.quick-head` / `.quick-amt` / `.quick-note` / `.quick-btns` pinned, new
  `.quick-body` is the only scroller (was three nested: sheet + `.quick-chips` + page).
- **v2.8.3** — **`tNodes(key, { nodes })` — the missing half of `t()`.** `t(key,{vars})` fills string
  placeholders; `tNodes` fills them with React elements, so a sentence keeps its `<b>`/`<strong>` emphasis
  without being chopped into per-fragment `t()` calls. Fragments were *the* reason the `proj-note` / `blend-note`
  prose was untranslatable — each fragment was already wrapped, but Korean reorders across them and no
  per-fragment key can express that. Dict 366 → 625. App-wide English on screen 241 → 117 distinct strings.
- **v2.8.2** — **`startLogDay(data)` is now the only rule for "which day am I logging?"** `openEntry` had the
  rule ("nothing logged today but something yesterday → stay on yesterday"); `openQuick` (the ＋ button) had
  none and always jumped to `logicalToday()`. So at 10:27 on the 16th with ₩285,700 sitting on the 15th, **＋
  wrote to the 16th while Quick Add sat on the 15th** — and ＋ is the primary phone path. Both now call
  `startLogDay`. The ＋ sheet also gained the "Still logging that day" prompt + confirm button (`.entry-newday`,
  reused from EntryModal). The "Logged so far" chips were always rendered in the ＋ sheet — they were empty
  because `quickDay` pointed at the wrong day, so the day fix lit them up for free.
- **v2.8.1** — **Overview is done.** 293 → 118 English words, hangul 507 → 951; the only English left on the
  tab is his own account names (Checking / Income / NASDAQ / Plan / Purchases). Dict 288 → 361.
  **`Stat` and `Line` now call `t()` on their label** the way `Card` already did — one edit each, 9 and 31
  call sites. Look for this pattern first: wrapping a shared component beats wrapping call sites.
- **v2.8.0** — **`t()` now interpolates: `t(key, { vars })` fills `{placeholders}`.** Backwards compatible;
  a missing key still falls back to English and placeholders fill either way. This was the blocker — the file
  builds sentences by gluing fragments around numbers, which can only ever express English word order.
  Korean reorders: `"{spent} of {budget}"` → `"{budget} 중 {spent}"`. **`DailyBudgetCard` fully rewired** —
  it had *zero* `t()` calls, so no dictionary entry could ever reach it. Overview: 449 → 293 English words,
  99 → 507 hangul. Dict 247 → 288.
  **Also renamed the budget-envelope header `Needs` → `Everyday`** to match the tab (v2.7.8 explicitly left
  this alone — reverse it if he objects; it's `t("Everyday")` in the `daily-section-h`).
- **v2.7.9** — **Korean: Fitness + Study translated, 99 → 248 `KO` entries.** Both tabs were 0%. Rendered
  English on those tabs: Fitness 118 → 18 words, Study 119 → 6 — the residue is his own data (`workoutKinds`,
  subject names, `goals[].label`), which no dictionary reaches. Tab labels `Fitness`/`Study` → 운동/공부, and
  the `LEDGER · ` eyebrow was **not wrapped in `t()`** at all (now is → 가계부 · ). BMI labels use KSSO terms
  because the cutoffs in the code are **18.5 / 23 / 25 = KSSO/Asia-Pacific, not WHO 18.5/25/30** — don't
  "correct" them to WHO. Remaining: **133** `t()` literals with no key (was 278).
- **v2.7.8** — **tab renames: Spending → Purchases, Needs → Everyday, Monthly → Totals.** Not cosmetic. The
  grid is wired to `plan.basicNeeds`, so naming a row into it *is* charging it to the ₩1.5M envelope — and the
  label said "needs" while holding Cafés (₩1.07M) and Shopping (₩714k), with Health sitting outside in Spending.
  The axis he actually sorts on is **recurring vs discrete**, never need vs want. Buckets were right, words were
  wrong; nothing was re-filed. Korean `생활비` ("living expenses") was already correct and carried over untouched;
  `지출`→`구매`, `월간`→`합계`. Renamed the `t()` **keys**, not added new ones — `t()` falls back to English on a
  missing key, so a renamed label with no key would silently render English in Korean mode.
  Also fixed a v2.7.6 miss: the Totals footnote still claimed *"Needs columns are matched to 2026 calendar months
  by their label"* — documentation describing the exact bug v2.7.6 removed.
- **v2.7.7** — audit pass. (a) **Crash fixed:** `data.goals[1].target` was the only unguarded `goals[]` read in
  the file; deleting the discharge goal on the Plan tab threw, the error boundary swallowed the whole app, and
  "Add goal" — the only way to restore it — lives on the tab that had just died. (b) **AFT standards collapsed
  from three copies to one.** `AFT_STD` + `aftStd(kind)` is now the sole source; the trend chart's literal table
  and the readiness list's `19 * 60 + 24` are gone, as are `MI2` and four raw `3.219`. Proven output-identical
  (86,386 chars of rendered Fitness tab, byte-for-byte apart from the version string).
- **v2.7.6** — **the Needs grid is year-aware.** Columns were identified by a free-text label ("Mar") with the
  year hardcoded to `"2026"` in *twelve* places, so a 2027 entry silently merged into the 2026 column of the same
  name, and the grid could never hold more than 12 months at all. Columns now carry an authoritative
  `ym: "YYYY-MM"`; `colYmOf(col)` is the only way to read a column's month and it **never** looks at the label.
  Header is a `DateInput` bound to the ym. Migration is gated on `rev < 5` — after that we never sniff a label
  again, so clearing the field can't resurrect the 2026 assumption. See below.
- **v2.7.5** — fixed an un-editable `To` field: typing a past month flipped the sub to "ended" and the hide-ended filter yanked the row out mid-keystroke. Rows being edited are now never filtered (`touchedSub`).
- **v2.7.4** — fixed a shredded TO column: `display:flex` on a `<td>` detached it from table layout. Flex moved to an inner wrapper.
- **v2.7.3** — subscription states (live / **last cycle** / **ended**); `DateInput` now forwards `title`; `enterKeyHint="done"`.
- **v2.7.2** — **ending a subscription ≠ deleting it.** The trash on a live sub is an End button setting `To` to the end of the paid cycle (monthly → this month; yearly → end of its 12-month period from `start`). Deleting used to erase the charge from every past month, shrinking his debt.
- **v2.7.1** — **budget engine, two real bugs** (see below). His measured debt roughly doubled.
- **v2.7.0** — sync advice auto-refreshes after push/pull; **editable per-entry FX rate** (`RateInput`).
- **v2.6.4** — one-off flag is an asterisk icon toggle (was a text pill + a 3-line note that doubled row height).
- **v2.6.3** — raw `⟳` glyph buttons → real SVG icons (`Repeat`, `RotateCw`).
- **v2.6.2** — computed cost basis rounded to whole won (fractional shares leaked decimals into an editable field).
- **v2.6.1** — **reverted** the capital-flows/XIRR ledger at his request. `flows` key remains in `normalizeData`, inert. **Don't rebuild unless he asks.**
- **v2.5.1** — uninvested cash excluded from cost basis, gain, return. `acctMarket(a) = acctBalance(a) − acctCash(a)`. Cash is in net worth only.
- **v2.5.0** — blended-return reality check on the projection card. **Its per-account default rates must never read `idealRate`** — that caused a feedback loop.
- **v2.4.1** — uninvested cash sleeve (`a.cash`) for brokerage accounts.
- **v2.4.0** — fitness visuals (composite AFT readiness, volume, consistency heatmap, weight-vs-load) + Apple Health paste import.
- **v2.3.x** — cardio distance+pace, AFT readiness vs standards, body/BMI log, PRs, trend target lines.
- **v2.2.x** — study statistics; mobile spending log kept as single-line rows w/ 660px scroll; keyboard-safe category picker.
- **v2.0–2.1** — Study tab (YPT-style) + statistics; rich session metadata.
- **v1.7.x** — Fitness + Study tabs.
- **v1.6.x** — smart sync advisor, per-transaction `noPace`, 4am logical day, service-era pace fixes.

**Rollback tags:** `v1.6.9` = last build with no Fitness/Study. `git checkout v1.6.9 -- index.html`. Study/fitness data survives a revert (unknown keys pass through).

### The v2.7.1 budget fix — understand this before touching `dailyBudget`

Two inconsistencies, both introduced by earlier Claude work:

1. **The daily figure spent from `pot − subs`, but the variance measured against the full `pot`** — silently crediting ~₩159k/month of "under budget" that never existed. Now `nfTarget(ym) = combinedBudget − subsActiveInMonth(ym)`, used by both `pastCumVar` and `curMonthOver`. *Checked first that his subs aren't also logged as expenses — they aren't; "Claude usage / Claude Max" rows are API overage, distinct from the ₩33,286 Claude Pro sub.*
2. **`combinedRecovery = dailyRecovery × dim` over-collected** — a full month's cut even when the debt needed part of one. Now `Math.min(combinedCumVar, maxMonthlySavings)`.

**Consequence:** his real debt is ~**₩1.04M**, not the ₩487k shown before. He's pinned at the 80% floor (₩2.8M/mo) until ~Aug 30. He enlists Aug 24, so the service era (₩600k/mo) takes over and the era reset (v1.6.7, `plan.__svcStart`) wipes the slate — it only bites for a few weeks. He understands and accepted this.

---

## Key domain decisions — argued out, don't re-litigate

- **`balance` on ISA/NASDAQ is a stale duplicate of the holdings total** and is deliberately ignored. Never repurpose it — you'd add a phantom ~₩26M to his net worth. Real cash lives in `a.cash`.
- **Cost basis = securities only.** Cash has no cost and no gain. He was right; the original design was wrong.
- **He wants "net capital invested" (his own typed number), not cost basis.** Cost basis is a *fallback only* — it drifts upward with every profitable round-trip. He finds it uninteresting and he's correct. Don't push him to reconcile it.
- **Subscriptions are INSIDE the ₩3.5M pot** (basicNeeds 1.5M + funMoney 2.0M). The card says so and the daily figure assumes it.
- **MMF stays tagged Invest?** — a real investment with a basis and yield, just not equity. The projection compounds `netWorth − 청약` at `idealRate`, which includes checking *and* MMF, so a blended return is the right comparison. (An earlier "untick MMF" suggestion was wrong.)
- **His 7% `idealRate` is optimistic** — the pot it compounds is ~32% cash-like, implying ~5.4%. The v2.5.0 card surfaces this; he hasn't applied it yet.
- **4am logical-day cutoff** (`logicalToday()`, `DAY_CUTOFF_HOUR = 4`) for *entry defaults only*. `todayISO()` stays wall-clock for sync/month-close.
- **"Needs"/"Spending"/"Monthly" survive in three places on purpose** (v2.7.8): the Totals data-series labels
  (chart legend, table header, `CAPS` tooltip map) and the Overview budget-envelope header name *data and
  envelopes*, not tabs; and `catMap["Needs"]` in `buildEraSnap` is a key **already written into his 7 saved
  snapshots** — renaming it would split old and new snapshots into two key spaces. Rule applied: rename anything
  that names a tab, leave anything that names data.
- **`dvh`/`vh` measure the LAYOUT viewport; the iOS keyboard only shrinks the VISUAL one.** Never size a
  keyboard-aware element with `dvh` minus a lift derived from `visualViewport`; the two disagree by
  `vv.offsetTop` the moment the user pans. Size it from `visualViewport.height` directly.
- **"The background scrolls" on iOS usually means visual-viewport panning, not scroll chaining.** `position:
  fixed` anchors to the LAYOUT viewport, so when iOS pans the visual viewport every fixed element slides. No
  amount of `overflow`/`overscroll-behavior` tuning will fix it. Check `visualViewport.offsetTop` first.
- **A modal needs exactly ONE scroll container.** Scrim = inert fixed backdrop (`overflow:hidden`); sheet =
  height-bounded, `overflow:hidden`; body = the single scroller with `overscroll-behavior:contain`. Adding a
  second scroller to "give overscroll-behavior something to bite on" is what caused the v2.8.5→v2.9.7 leak.
- **A broken build fails SILENTLY in jsdom.** `node --check` passed a stale file while the test reported
  computed styles from a build whose script never executed. Always run `node --check` on the CURRENT app.js and
  confirm it before trusting any jsdom output. (CSS lives inside a template literal — a backtick in a CSS
  comment terminates the string.)
- **Share counts are fractional — never round them for display.** `round4` turned 9.745119 into 9.7451 in the
  merge preview. Use `shFmt` (8dp, trailing zeros trimmed) for anything showing shares.
- **A cost basis is a historical fact; a price is a live quote.** They share the same cell shape
  (`{ccy,usd,krw,rate,asOf}`) but must behave oppositely on edit: basis freezes its rate, price re-stamps.
  `freezeRate` marks the difference. Never make `makeCell` re-stamp unconditionally again (v2.9.6).
- **For a top-up, prefer a NEW holding row over blending.** The data model already supports one ticker across
  several rows (his QQQ is two). Splitting keeps each lot's true purchase rate and needs no blend arithmetic;
  `@rate` exists for corrections and back-fill, not as the primary path.
- **Everyday spending is NOT in `expenses[]`.** The Everyday grid (`needs.rows x needs.months`) and Purchases
  (`expenses[]`) are disjoint stores — verified: not one expense carries an Everyday category name. Any figure
  that means "everything I spent" must add both. `totalExp` means Purchases only; `spendingOut` means all
  spending. Check which one you want (v2.9.5 was this bug, worth ₩8.9M of phantom investment loss).
- **The residual has an independent check — use it.** `invGain` on Overview is a plug; the Assets tab computes
  a real gain from `acctMarket(a) - acctBasis(a)` (shares x price vs shares x basis). When they disagree, the
  residual is wrong, not the portfolio. That comparison is how v2.9.5 was found.
- **Two "what day is it?" notions, on purpose.** `sysToday = logicalToday()` is the app's current LOGGING day
  under the 4am rule — it drives the default entry date (`startLogDay`) and the "Today so far" vs "Logged so
  far" label. `calToday = todayISO()` is the CALENDAR date and drives the new-day prompt, because past midnight
  he is entitled to advance to the real date. They differ between 00:00 and 04:00 and each is right for its own
  job — do not collapse them (mid-v2.9.4 I deleted `sysToday` outright and the modal stopped opening; the
  label needs it).
- **Two "am I in service?" notions, on purpose.** `__inSvc` = enlistment DAY (Aug 24), for ServiceCard.
  `__svcBudgetEra` = MONTH boundary (Sep 1 = `__svcPaceStart`), for the daily budget + projection. Wiring the
  budget to `__inSvc` collapses late-August to the ₩300k service budget while he's still civilian-income — the
  bug fixed in v2.8.9. Budget/projection use the monthly one; only day-one UI uses `__inSvc`.
- **Health is a dual citizen** (Everyday row + Purchases category), joined by name via `isNeed`. Any category
  that shares a grid-row name must be run through `dedupeCatsAgainstRows` before listing, or it shows twice.
- **`startLogDay(data)` decides the logging day. Both entry surfaces call it and nothing else.** Do not
  reintroduce a bare `logicalToday()` as an entry default — that is exactly the v2.8.2 bug.
- **A Needs column's month is `col.ym`, never its label.** `col.label` still exists but is vestigial display
  residue — **nothing may read it for meaning.** `migrateNeedsMonths` is the single exception and it is gated on
  `rev < 5`. If you find yourself writing `MON.findIndex(... col.label ...)`, you are reintroducing the v2.7.6 bug.
- **`needsLog` is not a record, it's a 60-day buffer** (`normalizeData`, ~line 771 prunes it). The grid cell is
  the only durable record of needs spending — which is why the cell losing its year was unrecoverable.
- Periods modal's income/spending/target fields are **inert reference notes**; the live engine is the Plan tab.
- **Service dashboard "Investable / mo" = this month's pay − (svcNeeds + svcFun + 적금 + 청약)** (v3.0.3). Pay is the
  Income-tab row for the month, else `plan.serviceIncome`. Negative through 상병 at his ₩600k living budget is the
  correct answer, not a bug: −₩350k/mo 일병, −₩50k 상병, +₩250k 병장 (2026 rates held). The 적금's 1:1 match is
  why funding that gap from savings is rational; don't "fix" the sign by shrinking the 적금.

### Things that already exist (he has asked for these already)

- **`DateInput` accepts full dates** — type 8 digits → `2026-07-15`; 6 digits → `2026-07`.
- **Enter / Escape already blur** any `DateInput`.
- **Subscriptions have `start` and `end`** date fields; `subsActiveInMonth` slices to `YYYY-MM`, so mid-month dates work.
- **Category exclusion** (`plan.excludeCats`) and **per-transaction `noPace`** both exist.
- **CSV exports** for daily ledger, needs grid, study sessions, and fitness log (⋮ menu).

---

## Scars — mistakes already made, don't repeat

- **`overscroll-behavior` only works on a scroll container.** On an element with no `overflow` it is inert —
  it will sit in the stylesheet looking like protection and do nothing. If you want a scrim to trap the chain,
  the scrim must have `overflow-y:auto`.
- **Two sheets, two patterns: prefer `.entry-scrim`'s.** Scrim scrolls, `overscroll-behavior:none`, no
  transform above the scroller. `.quick-sheet` has a `translateY(-kbLift)` because it is bottom-pinned; that
  transform is the reason it keeps breaking. If it breaks again, delete the transform and let the scrim scroll.
- **`max-height` in `dvh` and `translateY(-kbLift)` do not compose.** iOS does not shrink the layout viewport
  for the keyboard, so any `dvh` cap must subtract the lift: `calc(85dvh - {kbLift}px)`. Adding *any* content
  to `.quick-sheet` risks re-tripping this — the failure is silent, looks like "lag", and jsdom cannot see it
  because there is no layout engine. Adding height to a bottom sheet is a phone-test-required change.
- **Mask at the formatter, then sweep the rendered DOM.** Any privacy/formatting change must be verified by
  walking every tab's `textContent` with the flag on (`leak.js`), not by grepping. Six leaks survived a careful
  source read; the DOM sweep found all six in one pass, including two only visible as text CONCATENATED across
  sibling elements (`"Lands •••••• short of the 93,000,000 target"`), which no per-element query catches.
- **Wrapping a shared component beats wrapping call sites.** `Card` (title/sub), `Stat` (label), `Line` (k),
  `PlanRow` (label/note) all call `t()` internally now — that is ~70 sites from 4 edits. Check for a shared
  component before hand-wrapping anything.
- **A regex sweep will miss these, so grep for them by hand afterwards:** computed classNames
  (`className: "status-toggle " + (...)`), `createElement` calls spanning multiple lines, and ternaries in the
  children slot (`e.received ? "received" : "pending"`). ~117 strings still render English at v2.8.3 and these
  three shapes are most of what is left.
- **"Missing translation" has four different causes — count them separately or you will report nonsense.**
  (1) `t("x")` with no `KO` key; (2) `Card title/sub` with no key (`Card` *does* call `t()` on both — don't
  re-report this as a wiring bug, that was a v2.7.9 misdiagnosis); (3) **strings never wrapped in `t()` at all**
  — 210 of them at v2.7.9, and the single biggest cause; (4) sentences composed with `+` around numbers, which
  no key can match. A count of (1) alone is misleading and was quoted to him as if it were the whole picture.
- **Decode before you compare, when auditing i18n.** The bundle stores `\u00b7` as an escape in some places
  and a real `·` in others, so a script that diffs `t("…")` source text against `KO` source text reports
  false negatives (187 "missing" that were actually present). `json.loads('"'+raw+'"')` both sides first.
  This is the `repr()` scar wearing a different hat.
- **`t()` silently falls back to English on a missing key** (`t = (en) => LANG === "ko" && KO[en] ? KO[en] : en`).
  There is no missing-key warning, so an untranslated string looks identical to a deliberately-English one.
  To audit, boot in `ko` and count Latin words in `#root` — **strip `<style>` and `<script>` first**, or the
  CSS text lands in `textContent` and you'll measure ~8,900 English "words" per tab instead of ~300.
- **One fact, one home.** Every bug found in v2.7.6–2.7.7 is the same shape: a fact represented in more than one
  place, agreeing today, with nothing holding them together. The Needs column's year. The enlistment date (×5).
  The AFT standards (×3). `MILE2_KM` (×3, one of them named `MI2`). When you find yourself writing a constant
  that already exists somewhere else, that's the bug — not a style nit.
- **Enumerate by grep, not by reading.** The v2.7.6 sweep was planned as "nine sites" from reading the code.
  It was twelve. The three missed ones (`catInsights`, `commitStatement`'s bulk card import, and one more) only
  surfaced from `grep -n 'MON.findIndex' app.js` *after* the first patch ran. Grep for the pattern, then verify
  the grep comes back empty.
- **`DateInput` fires `onChange` on every keystroke, not on blur.** It is not like `FormulaInput`/`RateInput`.
  Anything order- or visibility-dependent bound to a `DateInput` must commit on blur (`onBlur`, dispatched as
  `focusout`), or the row/column moves out from under the caret. This is the v2.7.5 subscription bug's real cause.
- **A half-typed value is a real state.** `fmtDate("20271")` returns `"2027-1"`, which no `YYYY-MM` check accepts.
  Canonicalise on blur, and make anything still unparseable *visibly* inert (`th.no-ym`) rather than silently zero.

- **A filter that hides rows by state will hide the row the user is editing.** Typing a past `To` date made the sub "ended" and it vanished mid-keystroke. Always exempt the row being edited.
- **`display:flex` on a `<td>`** detaches the cell from table layout and shreds the column. Put flex on an inner wrapper.
- **A `useState` after an early `return`** → React error #310, whole app renders blank. All hooks go in the hooks zone, above `if (!data) return …`.
- **Deleting a block "from a comment to the next anchor" swallowed `acctBasis`** and shipped a crashing build. Delete by exact string; run `smoke3.js` before `cp`.
- **`window.prompt()` silently returns nothing in iOS standalone mode.** Never use it — inline inputs only.
- **Python escapes**: the file stores **real `·` `✓` `—` characters** in some places and literal `\uXXXX` in others. `repr()` the region before asserting.
- **`KNOB_SAV`** was a local const inside a `useMemo`; referencing it earlier crashed silently. Now module-scope.
- **A prop you pass isn't necessarily forwarded** — `DateInput` ignored `title` until v2.7.3. Check the signature.
- **Don't take "today" from the build.** v3.0.3 opened by telling him he enlists in 10 days — it had read
  `BUILD_AT = "2026-08-14 …"` as the current date. He had been in service for 2½ months. Use the system date.
- **A self-test aggregate computed mid-function silently exempts every later test.** Put `ok` right above
  the results loop, and prove a harness by breaking one assertion on purpose (v3.0.7).
- **He decided (2026-11-07): the enlistment date stays hardcoded** — it is a fixed past fact. Item 7 below is
  closed as won't-fix; just don't let anyone delete goal 0 (positional goals, item 6, still stands).
- **An idempotent patch helper must skip on `new in src` alone.** `new in src and old not in src` re-applies every
  append-after-anchor edit (where `new` contains `old`) — v3.0.3's second run duplicated the KO keys and self-tests
  before it was caught. Run every patch script twice and grep for duplicates.

---

## Suggested next work (roughly ranked)

1. ~~**The Plan tab tells him the 적금 match is counted when it isn't.**~~ **Done in v3.0.5.** The proj-note (~app.js 5031, *Ideal projection*
   detail) reads `earnings.find(month === "2028-02").amount` and prints "The 적금 government match (~₩1,500,000) is in
   your Income tab as the Feb-2028 entry" — that entry is his **병장 pay**. The real match (1:1 on deposits: 18 ×
   ₩550,000 = **~₩9.9M** if the 2026 rule holds) is in the projection **nowhere** — Overview even says "match isn't
   modelled". So the discharge figure (₩89.0M at 7.5%, "1,899만원 short of 108M") is ~₩9.9M low, and the two
   screens contradict each other. Also hardcodes `"2028-02"`. Raised in v3.0.3, not fixed — touches the projection.
   Options for him: (a) add the match as a 2028-02 income row (data only); (b) model it in `idealProj` (needs sign-off).
   **Measured:** a ₩9.9M income row on 2028-02-23 moves the 7.5% discharge figure ₩89,004,533 → ₩98,904,533 and
   "short" 1,899만원 → 909만원 — and the note still printed "~₩1,500,000", proving it never looks for the match.
1. ~~**Overview still headlines the pre-service goal.**~~ **Done in v3.0.5.** *Trajectory to 93,000,000 — "Projected at 2026-08-24 · 0 months
   remaining · Short ₩20,359,250"* is rendered 2½ months after that date passed. Should roll to the discharge goal.
   Same family as item 7 below (`future` gated on the `"2026-08"` literal).
1. ~~**Projection subtracts service-month Purchases on top of the ₩600k living budget.**~~ **Done in v3.0.7.** Service branch:
   `contrib = inc − svcLiving − expByMonth[m] − jeok − chung`, while the pre-service branch does not subtract
   `expByMonth` (funMoney covers purchases) and the daily budget counts purchases inside the same ₩600k. With the
   11-07 data that is −₩252,537 at discharge (비젠 installment + Nov gifts). Raised, not fixed — engine change.
1. ~~**Fix before Feb 2028 — the 적금 payout double-counts.**~~ **Done in v3.0.8.** (End date: done in v3.0.4.) `ServiceSettle`'s *record
   payout* credits Checking without draining the 적금 account, so the ₩9.9M of deposits is counted twice from the
   day he records it. The payout must empty the account it pays out of (and its undo must restore it).
1. ~~6-week pre-enlistment AFT plan~~ — obsolete; he enlisted 2026-08-24.
2. **Study × fitness correlation** — both have timestamps. `study.sessions` is still empty as of 2026-07-15.
3. Waist circumference alongside BMI (clinically better at his numbers: 167 cm / ~73 kg → BMI 26.2).
   `body.entries` is empty and `body.heightCm` is 0 — the log has never been used.
4. Protein/nutrition quick-log (only if he'll actually log meals).
5. **VERIFY v3.0.0 ON THE PHONE.** The ＋ sheet scroll fix is reasoned from a screen recording and arithmetic,
   not from rendered pixels. If it is still wrong, the next lever is deleting the `translateY(-kbLift)`
   transform entirely and letting the sheet sit in normal flow — that transform is the only structural
   difference between this sheet and the Quick Add modal, which has never had the problem.
6. **`inputMode: "text"` on `.quick-amt` (v2.9.7) summons the Korean keyboard**, so numbers now need a tap on
   「123」. It was changed from `"decimal"` to allow arithmetic (`12000+3400`). There is no iOS inputMode that
   offers digits AND operators — the options are a numeric keypad without arithmetic, or the full keyboard.
   Worth asking him which he prefers, or adding small operator buttons above the field.
7. **The enlistment date exists in five places; four are hardcoded.** `goals[0].date` is canonical and editable.
   `__svcPaceStart` (app.js ~2415) correctly derives from it. But `SERVICE_START = "2026-09"` is hardcoded in
   **three** separate `useMemo`s, `ServiceSettle` hardcodes `monthsBetween("2026-09", …)`, and `future` (the
   Trajectory card's income window) hardcodes `e.month <= "2026-08"`. They agree *today* only because
   2026-08-24 happens to round to 2026-09. **Proven divergence:** set `goals[0].date = "2026-10-24"` and the
   Trajectory card renders "Projected at 2026-10-24 · **2** months remaining" — the 2 is `future.length`, still
   gated on the 2026-08 literal. Same disease as the Needs grid: one fact, many representations. Fixing it
   touches the projection engine, so it needs his sign-off first, not a drive-by.
6. **Goal identity is positional across ~20 sites.** `goals[0]` = enlistment, `goals[1]` = discharge, by array
   index, while the Plan tab lets him delete either and appends new ones. Deleting goal 0 silently makes the app
   believe he enlists on his discharge date — no error, no warning. The v2.7.7 guard stops the *crash*; it does
   not stop the *misconfiguration*. Real fix is a `role: "enlist" | "discharge"` field, or refusing to delete the
   two structural goals.
7. `Needs` tab's own `completeMonths` (unlike `dailyBudget`'s `pastMonths`) has **no `__svcStart` filter**, so
   after enlistment it will keep counting 2026 columns as complete months forever. Not urgent, but it's the same
   family of bug and it's now the only one left in the tab. Raised, not fixed — didn't want to widen v2.7.6.

**Explicitly rejected:** capital-flows/XIRR ledger (built then reverted), group study features, push notifications (unreliable on iOS home-screen apps), GPS/Strava import.

---

## Style notes

- **Substance over agreement.** If his idea is wrong, say so and show the evidence.
- **Explain before building.** Check for existing functionality first.
- **One `fmdeploy` line at the end of every version.** Never raw git.
- Formal written Korean (문어체) when writing Korean.
- Evidence standards: RCT-level, government sources, reputable trade press. **Never** Namu Wiki, hospital marketing blogs, or personal blogs.
- Be honest about what testing did and didn't cover.
