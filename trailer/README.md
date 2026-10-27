# Trailer

Build notes for the optcgduel.app trailer (issue #754). Capture scripts write `trailer/clips/<id>.mp4`; the Remotion project in `trailer/video/` edits them into `trailer/out/trailer-16x9.mp4`.

## Rendering

The edit lives in `trailer/video/` (Remotion 4, React, TypeScript). It reads the clips from `trailer/clips/` and renders a 1920x1080, 30 fps, 67.5 s trailer on a 120 BPM grid (every cut lands on a 0.5 s beat).

```bash
cd trailer/video
npm install
npm run clips:placeholders   # optional: labelled placeholder clips, ONLY for ids missing from ../clips
npm run render               # -> trailer/out/trailer-16x9.mp4  (about 6 min on 4 CPUs)
npm run render:9x16          # -> trailer/out/trailer-9x16.mp4  (stub layout, 1080x1920)
npm run studio               # live preview and scrubbing while tuning
```

`npm run render`, `studio` and `still` run `npm run prerender` first: it copies `../clips/*.mp4` into `public/clips/` (gitignored), probes each clip's real duration, and notes whether `public/music.mp3` exists. Real capture output is never overwritten by the placeholder script. Quick check of one frame: `npm run still -- out.png --frame=600`.

Where to tune, all in one file, `trailer/video/src/scenes.config.ts`:

- `CLIPS`: clip manifest (id, file, nominal duration, orientation).
- `SCENES`: the timeline. Per scene: `start` / `dur` (seconds, keep to multiples of 0.5), `trimStart`, `rate` (speed), `clipDelay`, `transition` (`cut`, `fade`, `zoom`, `wipe-right`, `wipe-left`), `eyebrow` (small caps sub-caption) and `focus`: camera keyframes `{at, rect}` where `rect` is `{x, y, w, h}` in 0..1 clip coordinates (`r(x, y, w)` is a 16:9 shortcut). The camera springs to each rect at its `at` time. Re-aim these once the real footage exists.
- `CAPTIONS`: the on-screen lines and when they show (`em` words get the gold bold style).
- `PHONE`: the phone section (13.5 s to 23 s): the browser frame gives way to a large phone (`src/PhoneStage.tsx`) that plays clip 12, turns 90 degrees with a spring while the footage crossfades to clip 13, then hands back to the browser frame. Rates, eyebrows and the "Add to Home Screen" chip are set there.
- `END_CARD`: end-card clips, URL and the "Not affiliated" line.

Other knobs: `src/layout.ts` (frame size and text positions for 16:9 and 9:16), `src/theme.ts` (colours, `BPM`, fonts), `src/Background.tsx` (gradient, compass, sea lines).

Music: drop a licensed 120 BPM track at `trailer/video/public/music.mp3` (gitignored). It fades in over 1.5 s and out over the last 3 s. Without the file the trailer renders silent. If a captured clip is shorter than its scene, its last frame is held; if longer, the scene's `trimStart` / `rate` decide what is used.

Fonts (Sora and Fraunces, the app's fonts) are vendored in `public/fonts/` so renders work offline. If Remotion cannot download its own headless Chrome, set `REMOTION_USE_PW_CHROME=1` to use the Playwright one in `/opt/pw-browsers`.

## Capturing

The screen footage is recorded from the real apps on this machine by Playwright scripts in `trailer/capture/` (TypeScript, run with `tsx`). Nothing touches production and no account is created: every FastAPI call is answered inside the browser (`page.route`, see `capture/lib/fakeApi.ts`), the game server is the local one, and the "players" (Miko, Zoro_main, NamiNavigator ...) are names in a script.

```bash
cd trailer/capture
npm install                    # once: playwright, tsx, typescript
./run.sh                       # every clip -> trailer/clips/<id>.mp4, one still each -> trailer/clips/stills/<id>.png
./run.sh 02 06-friends         # some of them, by number or id
SHOTS=1 ./run.sh 09            # also drops debug screenshots into /tmp/shots
npm run typecheck
```

`run.sh` needs `Xvfb`, `ffmpeg` and a Chromium (`/opt/pw-browsers/chromium`, override with `PW_CHROMIUM_PATH`). It starts, on ports of its own so `npm run e2e` is never disturbed, Xvfb `:97` (1920x1080), `:96` (the portrait phone clips) and `:95` (the landscape phone clip), the local game server on `:2667`, duel-web's Vite on `:5274` and the planner's Vite on `:5275` (clip 10), and stops what it started. Servers that already run on those ports are reused. Both Vite servers get `VITE_API_URL=http://127.0.0.1:8865`, an address nothing listens on.

How a clip is made:

- A real headed Chromium window (kiosk, no browser chrome) sits at 0,0 of the Xvfb screen at exactly 1920x1080 (the phone clips: 375x812 CSS px, or 812x375 sideways, at device pixel ratio 2, 750x1624 or 1624x750 px, touch layout). `ffmpeg x11grab` records it at 30 fps into a near-lossless intermediate in `trailer/clips/.raw/`; the script marks where the clip starts and ends (and can cut out a stretch in the middle) and the final encode is H.264 crf 15, yuv420p, no audio, faststart. Playwright's own `recordVideo` is not used (low bitrate).
- The pointer is a page overlay (the real cursor is not captured): an arrow with a click ripple, moved along curved, eased paths with a beat before each click (`lib/cursor.ts`). The phone clips use a touch ring.
- Takes repeat: every game room gets a fixed shuffle `seed` (the same trick as `e2e/fixtures.ts`), decks are fixed, and the fake clock-free data is the same each run.
- Card art: TCGplayer's CDN serves a "SAMPLE" watermark or an "Image coming soon" card for most prints. The trailer decks (`lib/data.ts`) are built only from cards whose art was checked by eye to be clean (Straw Hat starter ST01, Worst Generation ST02, and clean OP01 cards).
- Original artwork for the custom-art clip (`assets/playmat.png`, `assets/cardback.png`) is generated by `assets/make_assets.py`; it is not anyone's card art.
- `assets/match.json` is a bot-vs-bot game on the real rules engine (Straw Hats beat Wano, 9 turns) plus its `seatLog`; the faked history API serves it to the Log Pose and replay clip. Regenerate with `npx tsx tools/genMatch.ts`.

What each clip substitutes (anything not listed is the real app):

| Clip | Real | Faked or staged |
| --- | --- | --- |
| 01-landing | Lobby UI | Account, friends, voyage, bounties |
| 02-turn | Play vs Bot on the local server | Account; the first turns are played before the camera rolls |
| 03-themes | The board, nine themes and light mode | The theme switch is the Settings call (`updateSettings`), not the Settings menu clicks |
| 04-custom-art | Settings uploads (real file chooser and crop editor), DON!! art, the board | The match is set up off camera and spliced in |
| 05-layout | Panel drag, hand move, Tilted board toggle | |
| 06-friends | Invite, accept, both seats in one room | Presence and invites (the friends API); the second player is a real second browser parked just off screen |
| 07-spectate | `/watch/<room>` on a live room | The watched player is a second browser off screen |
| 08-ranked | The real ranked queue and its seat clocks | Ratings and the leaderboard are fake; the opponent is a second browser |
| 09-logpose | Match log page, review card, replay viewer | Log Pose's reply is streamed by a `fetch` stand-in inside the page (the analyst service is not run); the review text is written by hand and only states things in `match.json` |
| 10-planner | Planner deck page, market popover, Play in Duel into the local duel-web | Card prices, rarities and owned counts are invented (rarity is guessed from cost); the link is opened in the same tab |
| 11-phone | Same match on a phone viewport | As clip 02 |
| 12-phone-portrait | A practice game on a 375x812 phone: drag a card from the fan to play it, drag a DON!! chip onto the Leader, drag the Leader onto the opponent's to attack, End turn, then answer the bot's attack (Pass block, a Counter chip, Resolve) | As clip 02; the waits for the opponent's counter and for the bot's turn are cut out of the recording (three hidden stretches, see `rec.cut()` in the script) |
| 13-phone-landscape | The same game sideways (812x375): play a card, give DON!!, attack | As clip 02 |
