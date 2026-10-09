import type { PatchNote } from "./types";

/**
 * Player-facing patch notes, newest first. Shown on the What's new page and in
 * the once-per-update card in duel-web and the planner.
 *
 * Adding a note: put a new entry at the TOP with today's date (UTC, YYYY-MM-DD)
 * and the app it changes. Write one or two plain sentences a player would
 * understand; say what they can now do, not how the code changed. Skip
 * internal work (tests, refactors, CI) and fixes nobody noticed.
 */
export const PATCH_NOTES: PatchNote[] = [
  // 2026-10-09
  { date: "2026-10-09", app: "duel", pr: 484, title: "Hands and Life revealed at game end", text: "When a match ends, both hands and every Life card flip face up for players and spectators, so you can see what your opponent was holding." },
  { date: "2026-10-09", app: "duel", pr: 474, title: "An even bigger playing area", text: "With Bigger playing area on, computers lose the top bar (its menu is the ⋯ button in the side column) and both computers and landscape phones get wider two-row playmats with bigger cards. Press F for full screen." },
  { date: "2026-10-09", app: "duel", pr: 480, title: "Switch decks for a rematch", text: "When you ask for or accept a rematch you can now pick a different deck first. Your opponent sees that you're bringing a new deck." },
  { date: "2026-10-09", app: "both", pr: 473, title: "Log Pose sees the whole game in reviews", text: "Game reviews now see your hand, both boards, Life and DON!! each turn, both deck lists and the text of every card, so Log Pose can tell you which counters you held and what the opponent was doing. The opponent's hand and deck list are shown only once the game is over." },
  { date: "2026-10-09", app: "duel", pr: 475, title: "Roomier match logs", text: "On a computer the match log is wider and each turn shows your hands beside what happened, so more fits on screen. Repeated cards in a hand show once with ×2 or ×3, and a row of turn numbers at the top jumps straight to any turn." },
  { date: "2026-10-09", app: "duel", pr: 465, title: "Opponent hand beside their mat", text: "Pin the opponent's hand to the left or right of the board and it now sits as a small fan in the open space beside their mat instead of crowding its corner. Drag it there, or pick it in Settings." },
  { date: "2026-10-09", app: "duel", pr: 471, title: "Small phones in landscape", text: "Phones narrower than 600px, like the iPhone SE, now get the full landscape board instead of a squeezed one." },
  { date: "2026-10-09", app: "duel", pr: 456, title: "Bigger board, dockable pop-ups and more", text: "A Bigger playing area setting, switches to hide Card preview, Recent plays and Chat, and pop-ups you can dock into a side column. Attach DON!! works again, /ff concedes, and an agreed Undo keeps the same draws." },
  { date: "2026-10-09", app: "duel", pr: 467, title: "Tidier Brief and Log Pose buttons", text: "The Brief and Log Pose buttons at the top of a game now have the same even spacing, so \"Log Pose\" no longer presses against its border." },
  { date: "2026-10-09", app: "duel", pr: 466, title: "Full Bounty leaderboard and a menu", text: "Tap Top bounties on the home page to see the full leaderboard. A menu button on every page takes you home or anywhere else in one tap." },
  { date: "2026-10-09", app: "duel", pr: 464, title: "Solid Mulligan button", text: "The Mulligan button is solid now instead of see-through, so the board no longer shows through it." },
  { date: "2026-10-09", app: "duel", pr: 459, title: "More EB05 cards playable", text: "28 more EB05 Heroines Edition Vol. 2 cards are playable in duels. EB05 card text comes from TCGPlayer until Bandai publishes it." },
  // 2026-10-08
  { date: "2026-10-08", app: "both", pr: 444, title: "Meta deck browser", text: "Browse popular tournament decks by leader and turn one into your own deck with a single click." },
  { date: "2026-10-08", app: "duel", pr: 441, title: "Choose your DON!! art", text: "Pick which DON!! card art you play with in Settings." },
  { date: "2026-10-08", app: "duel", pr: 438, title: "A fuller home page", text: "The home page now shows your deck up front, your record, the top bounties and how many people are playing right now." },
  { date: "2026-10-08", app: "duel", pr: 439, title: "Log Pose panel can dock to a side", text: "The Log Pose window has rounded corners, opens out of the compass, and can be docked to the left or right of the screen." },
  { date: "2026-10-08", app: "duel", pr: 427, title: "Matchup brief stays on screen", text: "The Log Pose matchup brief now sits in a panel you can drag and resize during the game." },
  { date: "2026-10-08", app: "duel", pr: 426, title: "Pop-ups remember where you put them", text: "If you drag a choice pop-up out of the way, the next one opens in the same spot." },
  { date: "2026-10-08", app: "planner", pr: 437, title: "Bigger DON!! cards", text: "The DON!! browser shows bigger cards and has a search box." },
  { date: "2026-10-08", app: "planner", pr: 436, title: "Fairer deck price for alt arts", text: "The \"$ left\" price now counts each alt art you want at its own price and quantity." },
  // 2026-10-07
  { date: "2026-10-07", app: "duel", pr: 413, title: "Attack-ready glow", text: "Cards that can still attack this turn get a soft green glow. You can turn it off or down in Settings." },
  { date: "2026-10-07", app: "duel", pr: 419, title: "Log Pose copilot", text: "In casual and practice games, Log Pose can suggest your next play and walk through the turn with you." },
  { date: "2026-10-07", app: "duel", pr: 409, title: "Matchup brief before a game", text: "Before casual and practice games, Log Pose can give you a short brief on the matchup." },
  { date: "2026-10-07", app: "both", pr: 406, title: "Apply Log Pose deck edits", text: "When Log Pose suggests deck changes, an Apply card makes them for you in one tap." },
  { date: "2026-10-07", app: "both", pr: 404, title: "\"Why?\" on build hints", text: "Tap Why? on a deck build hint to ask Log Pose to explain it." },
  // 2026-10-06
  { date: "2026-10-06", app: "both", pr: 377, title: "Log Pose deck analyst", text: "Chat with Log Pose about your decks and get a review after each game. Ask for access from the Log Pose panel." },
  { date: "2026-10-06", app: "both", pr: 375, title: "Send feedback", text: "Report a problem or send feedback from the footer of either app." },
  { date: "2026-10-06", app: "duel", pr: 363, title: "Spectate links", text: "Share a /watch link so friends can spectate your game and see both hands." },
  { date: "2026-10-06", app: "duel", pr: 367, title: "Big card preview setting", text: "Choose between a big card preview or a small card with icons and text when you hover a card." },
  { date: "2026-10-06", app: "duel", pr: 382, title: "Split DON!! piles", text: "Right-click or long-press a DON!! to split it into its own pile." },
  { date: "2026-10-06", app: "duel", pr: 385, title: "Sort the trash", text: "The trash viewer can show cards newest first or grouped by card." },
  { date: "2026-10-06", app: "duel", pr: 373, title: "Actions on the board", text: "On desktop, actions now live on the board itself instead of a side panel." },
  // 2026-10-05
  { date: "2026-10-05", app: "duel", pr: 353, title: "Ranked chess clock", text: "Ranked games now give each player their own 15 minute clock." },
  { date: "2026-10-05", app: "duel", pr: 362, title: "Life triggers stay secret", text: "Every Life hit asks Trigger or No Trigger, so the log no longer gives away what you took." },
  { date: "2026-10-05", app: "duel", pr: 354, title: "Hands in the match log", text: "The match log shows your hand at the start of each turn, and your opponent's once the game is over." },
  { date: "2026-10-05", app: "duel", pr: 360, title: "Resizable side panels", text: "Drag the edges of the side columns and panels on desktop to resize them." },
  { date: "2026-10-05", app: "duel", pr: 364, title: "Drag cards out of your hand", text: "A dragged hand card lifts out of the hand and follows your finger or pointer." },
  // 2026-10-04
  { date: "2026-10-04", app: "planner", pr: 268, title: "Collection page", text: "A new Collection tab lists the cards you own with their total value, and lets you add cards." },
  { date: "2026-10-04", app: "duel", pr: 270, title: "Yes / No on the card", text: "Yes and No appear right above the hand card they're about, and an arrow follows your drag when you attack." },
  // 2026-10-02
  { date: "2026-10-02", app: "duel", pr: 261, title: "Movable panels and fanned hand", text: "Move the side panels around and fan your hand however you like." },
  { date: "2026-10-02", app: "duel", pr: 258, title: "Pick DON!! from the board", text: "Choose DON!! for costs and targets straight from the board instead of a pop-up." },
  // 2026-10-01
  { date: "2026-10-01", app: "duel", pr: 253, title: "Sound effects", text: "Drawing, playing, attacking, blocking and countering now have sounds." },
  { date: "2026-10-01", app: "duel", pr: 252, title: "Turn-by-turn match logs", text: "Tap a game in your match history to read what happened each turn." },
  { date: "2026-10-01", app: "duel", pr: 240, title: "Crew colour themes", text: "Pick a One Piece crew colour theme, with a light mode for every theme." },
  { date: "2026-10-01", app: "duel", pr: 243, title: "Deck stats in the deck editor", text: "The deck editor shows your cost curve, draw odds and build hints." },
  { date: "2026-10-01", app: "duel", pr: 239, title: "Update check", text: "The app tells you when a newer version is live, so you can reload to get it." },
  { date: "2026-10-01", app: "duel", pr: 221, title: "Settings follow your account", text: "Your settings, playmat and card back are saved to your account and follow you to other devices." },
  // 2026-09-30
  { date: "2026-09-30", app: "both", pr: 202, title: "Play your planner decks", text: "Decks you build in the planner can be played in the duel app, with a Play in Duel button on each deck." },
  { date: "2026-09-30", app: "planner", pr: 206, title: "Deck stats panel", text: "Decks show a stats panel with the cost curve, counters and draw odds, on your deck page and on share links." },
  { date: "2026-09-30", app: "duel", pr: 205, title: "Bounty rating", text: "Your ranked rating now shows as a Bounty in Berries." },
];
