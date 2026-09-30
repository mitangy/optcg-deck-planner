# Phone duel roadmap: P3 (parked)

The phone UX review of September 2026 ranked 16 changes for playing on a phone in portrait and landscape. P0 (safe areas, installable shell, wake lock, battle strip, status icons), P1 (slim header, one primary action, opponent pile counts, landscape layout) and P2 (defend tray, DON!! tap path, response stops, feedback cues, orientation choice) are built in `duel-web/`. The two P3 items below are parked as low priority. They are recorded here so the reasoning is not lost when they come back up.

## 15. Wrap duel-web in the Expo app (size M)

**Today.** `mobile/` is an Expo app that is locked to portrait (`mobile/app.json`, `"orientation": "portrait"`). It draws zones as a scrolling list with a button bar (`mobile/src/board/DuelBoard.tsx`), does not apply safe-area insets even though `react-native-safe-area-context` is installed, and shows raw JSON in its trigger and battle banners. It has fallen far behind `duel-web/`, which now has the phone layouts, the defend tray, and the settings above.

**Proposal.** Replace the native board with a WebView shell that loads the deployed duel-web and adds a small native bridge:

- **Store presence:** the App Store and Play Store listing and icon come from Expo and EAS, as ADR-002 already plans.
- **Native haptics:** `expo-haptics` fires on the same events duel-web uses for `navigator.vibrate`, including on iPhone, where Safari has no vibration API.
- **Keep-awake:** `expo-keep-awake` replaces the web Wake Lock, which iOS Safari only supports in recent versions.
- **Orientation lock:** `expo-screen-orientation` follows the duel-web orientation setting, which web can only lock in fullscreen on Android.
- **Safe areas:** the WebView fills the screen edge to edge, and duel-web already pads itself with `env(safe-area-inset-*)`.

The bridge would be a `window.ReactNativeWebView.postMessage` channel with a handful of messages: `haptic`, `keepAwake`, `orientation` and `share`. On the web side, duel-web would detect the shell and route those calls through it instead of the browser APIs.

**Trade-offs.**

- It leaves one board to maintain instead of two. Every duel-web layout change reaches the app with no native work.
- It needs network access to load the board, unless the build is bundled into the app. Loading the deployed URL is simplest, and app updates then ship with Vercel deploys.
- It changes ADR-002's split, where native features land in `mobile/`. Record that in `DECISIONS.md` if this is picked up.
- **Alternative:** park `mobile/` entirely and ship duel-web as an installable PWA, which P0 already enabled. That costs nothing, but gives up store presence and iPhone haptics.

**Done when:** the Expo app opens a match in duel-web in both orientations on a real iPhone and Android phone, taps buzz on iPhone, the screen stays awake through an opponent's turn, and the native list board is deleted.

## 16. Phone layout check in the loop (size S)

**Today.** Phone layouts are checked by hand for each PR, using Playwright screenshots of `/demo` at a few sizes. Nothing stops a later PR from breaking the portrait or landscape board without anyone noticing.

**Proposal.**

- Add a script, for example `duel-web/scripts/phone-shots.mjs`, that starts the Vite preview. It then screenshots `/demo` with touch emulation at 375×667, 390×844, 667×375, 844×390 and 1280×800, and writes the PNGs to an artifacts folder.
- For each phone size, the same script checks for page scroll (`scrollWidth > innerWidth` or `scrollHeight > innerHeight`). It fails if either is true.
- Run it in the `duel-web` CI job and upload the shots as a workflow artifact, so reviewers can open them from the PR.
- Before shipping layout work, also do a real-device pass using the `phone-testing` skill (`.claude/skills/phone-testing/SKILL.md`). Emulation does not show notch insets, iOS Safari's toolbars, or screen dimming.

**Why it's parked:** the P0 to P2 batches were each checked this way by hand, so a script mostly saves time for future layout work. It's worth doing before the next large board change.
