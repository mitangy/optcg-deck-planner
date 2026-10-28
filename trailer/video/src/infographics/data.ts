import type {InfographicSpec, ShotSpec} from './kit';

const desk = (src: string, o: Omit<ShotSpec, 'src' | 'kind'>): ShotSpec => ({src, kind: 'desktop', ...o});
const cmp = (src: string, o: Omit<ShotSpec, 'src' | 'kind'>): ShotSpec => ({src, kind: 'compact', ...o});
const ph = (src: string, o: Omit<ShotSpec, 'src' | 'kind'>): ShotSpec => ({src, kind: 'phone', tag: 'Phone', ...o});

/** Shared crops of the bottom-left of the board, where the fanned hand lives. */
const handCrop = {focus: ['toggle', 'fan'], pad: [14, 40, 270, 0] as [number, number, number, number], ar: 2.6};
/** Just the Hand / Sort buttons and the first cards beside them: big enough to read. */
const handTight = {focus: ['toggle', 'sort'], pad: [14, 40, 330, 10] as [number, number, number, number], ar: 2.0};

export const INFOGRAPHICS: InfographicSpec[] = [
  {
    id: 'send-feedback',
    title: 'Send feedback in 3 taps',
    subtitle: 'Ideas, bugs, anything. It takes under a minute.',
    steps: [
      {
        text: 'Tap **Send feedback** in the footer, or **Report a problem** in a match.',
        shots: [
          desk('fb-lobby-bottom', {focus: ['whatsnew', 'send'], pad: [8, 22, 8, 0], rings: [{k: 'send', pad: 5}]}),
          ph('p-menu', {focus: ['report'], pad: [24, 90, 24, 70], ar: 1.9, rings: [{k: 'report', pad: 4}]}),
        ],
      },
      {
        text: 'Pick **Problem**, **Idea** or **Other**, then say what happened.',
        shots: [desk('fb-dialog-filled', {focus: ['kinds', 'text'], inside: 'card', pad: [8, 4, 8, 4], rings: [{k: 'kinds', pad: 3}, {k: 'text', pad: 5}]})],
      },
      {
        text: 'Tap **Send**. You will see “Thanks, we got it.”',
        shots: [
          desk('fb-dialog-filled', {focus: ['text', 'send'], inside: 'card', pad: [8, 6, 8, 8], rings: [{k: 'send', pad: 5}]}),
          desk('fb-dialog-sent', {focus: ['card'], inside: 'card', pad: 0, rings: [{k: 'thanks', pad: 4}]}),
        ],
      },
    ],
    tip: 'Also in **Settings › About**. Sent mid-match, your **room ID** goes along automatically.',
  },
  {
    id: 'report-card',
    title: 'Report a card that isn’t working',
    subtitle: 'Tell us exactly what the card did wrong.',
    steps: [
      {
        text: '**Right-click** a card, or **press and hold** it on a phone.',
        shots: [
          desk('m-board', {focus: ['killer'], pad: [60, 50, 250, 50], ar: 1.5, rings: [{k: 'killer', pad: 5, arrow: 'right', label: 'Right-click'}], tag: 'Desktop'}),
          ph('p-board', {focus: ['killer'], pad: [30, 30, 210, 40], ar: 1.5, rings: [{k: 'killer', pad: 4, arrow: 'right', label: 'Hold'}]}),
        ],
      },
      {
        text: 'In the card pop-up, tap **Report a problem with this card**.',
        shots: [
          desk('r-inspect', {focus: ['ability', 'report'], inside: 'dialog', pad: [10, 6, 10, 10], rings: [{k: 'report', pad: 6}]}),
          ph('p-inspect-scrolled', {focus: ['ability', 'report'], inside: 'dialog', pad: [6, 6, 6, 10], rings: [{k: 'report', pad: 5}]}),
        ],
      },
      {
        text: 'Say what happened, then tap **Send report**.',
        shots: [
          desk('r-form-filled', {focus: ['label', 'text', 'send'], inside: 'dialog', pad: [8, 2, 8, 8], rings: [{k: 'text', pad: 5}, {k: 'send', pad: 5}]}),
          ph('p-form', {focus: ['label', 'text', 'send'], inside: 'dialog', pad: [8, 2, 8, 8], rings: [{k: 'text', pad: 5}, {k: 'send', pad: 5}]}),
        ],
      },
    ],
    tip: 'You will see “Thanks, your report was sent.” It includes the **card number** and **room ID**.',
  },
  {
    id: 'hand-tuck',
    title: 'Tuck, raise and hide your hand',
    subtitle: 'Your fanned hand, the way you want it.',
    steps: [
      {
        text: '**Hover** the tucked hand to raise it.',
        shots: [
          cmp('h-tucked', {...handCrop, tag: 'Tucked', rings: [{rect: {x: 232, y: 668, w: 420, h: 30}, pad: 3, radius: 10}]}),
          cmp('h-hover', {...handCrop, tag: 'Raised'}),
        ],
      },
      {
        text: 'Click **Hand** to keep it up. Click again to tuck.',
        keys: ['H'],
        shots: [cmp('h-pinned', {...handTight, rings: [{k: 'toggle', pad: 5, arrow: 'right', label: 'Hand'}]})],
      },
      {
        text: 'With **Keep hand open** on, **Hide** tucks it fully away.',
        keys: ['H'],
        shots: [
          cmp('h-keep', {focus: ['hide'], pad: [14, 110, 330, 10], ar: 2.0, rings: [{k: 'hide', pad: 5}]}),
          cmp('h-hidden', {focus: ['hide'], pad: [14, 110, 330, 10], ar: 2.0, rings: [{k: 'hide', pad: 5}]}),
        ],
      },
      {
        text: 'On a phone, tap **Hide** on the hand bar. **Show** brings it back.',
        shots: [
          ph('p-sorted', {focus: ['hide'], pad: [250, 110, 14, 12], ar: 2.2, rings: [{k: 'hide', pad: 5}]}),
          ph('p-hand-folded', {focus: ['show'], pad: [250, 110, 14, 12], ar: 2.2, rings: [{k: 'show', pad: 5}]}),
        ],
      },
    ],
    tip: 'Drag a card toward the board and the hand tucks itself, so you see everything.',
  },
  {
    id: 'hand-arrange',
    title: 'Sort, reorder and move your hand',
    subtitle: 'Keep the cards you need where you want them.',
    steps: [
      {
        text: 'Press **Sort** to order your hand by cost.',
        keys: ['S'],
        shots: [
          cmp('h-sorted', {...handTight, rings: [{k: 'sort', pad: 5, arrow: 'right', label: 'Sort'}]}),
          ph('p-sorted', {focus: ['sort'], pad: [140, 60, 120, 150], ar: 1.9, rings: [{k: 'sort', pad: 5}]}),
        ],
      },
      {
        text: 'Sort off? **Drag** a card sideways to put it in a new spot.',
        shots: [cmp('h-reorder', {focus: ['toggle', 'fan'], pad: [14, 60, 270, 0], ar: 2.6, tag: 'Dragging'})],
      },
      {
        text: 'Drag the **grip** to move your hand anywhere on screen.',
        shots: [
          cmp('h-grip', {focus: ['grip', 'toggle'], pad: [14, 40, 330, 10], ar: 2.0, rings: [{k: 'grip', pad: 6, arrow: 'right', label: 'Grip'}]}),
          cmp('h-moved', {rect: {x: 0, y: 330, w: 1040, h: 370}, ar: 2.8, tag: 'Moved'}),
        ],
      },
    ],
    tip: 'Drop the hand on the bottom edge to snap it back. **Esc** cancels a move.',
  },
  {
    id: 'undo',
    title: 'Take back a move with Undo',
    subtitle: 'Misclicked? Undo the last action or the whole turn.',
    steps: [
      {
        text: 'Tap **↺** (Undo) in the top bar.',
        shots: [
          desk('u-before', {focus: ['undo'], pad: [380, 20, 20, 160], ar: 2.0, rings: [{k: 'undo', pad: 5, arrow: 'left', label: 'Undo'}], tag: 'Desktop'}),
          ph('p-board', {focus: ['undo'], pad: [200, 20, 20, 90], ar: 2.0, rings: [{k: 'undo', pad: 4}]}),
        ],
      },
      {
        text: 'Choose **Last action** or **Whole turn**.',
        shots: [
          desk('u-menu', {focus: ['undo', 'list'], pad: [30, 20, 30, 20], ar: 1.7, rings: [{k: 'last', pad: 4}, {k: 'turn', pad: 4}]}),
          ph('p-undo', {focus: ['undo', 'list'], pad: [30, 20, 30, 20], ar: 1.7, rings: [{k: 'last', pad: 4}, {k: 'turn', pad: 4}]}),
        ],
      },
      {
        text: 'Your opponent taps **Allow**. Practice games undo at once.',
        shots: [
          desk('u-before', {focus: ['sanji'], pad: 80, ar: 1.5, tag: 'Before', rings: [{k: 'sanji', pad: 5}]}),
          desk('u-after', {focus: ['log'], pad: [240, 70, 20, 30], ar: 1.5, tag: 'After', rings: [{k: 'log', pad: 5}]}),
        ],
      },
    ],
    tip: 'Undo works in casual and private rooms. **Ranked** games have no undo.',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts that save time',
    subtitle: 'On a computer, keep your hand on the keys.',
    steps: [
      {
        text: '**Space** ends your turn, passes, or confirms.',
        keys: ['Space'],
        shots: [desk('m-board', {focus: ['end'], pad: [150, 60, 60, 90], ar: 1.7, rings: [{k: 'end', pad: 5}]})],
      },
      {
        text: '**Y** answers Yes and **N** answers No on a prompt.',
        keys: ['Y', 'N'],
        shots: [desk('y-confirm', {focus: ['prompt'], pad: 6, ar: 1.7, rings: [{k: 'yes', pad: 5}, {k: 'no', pad: 5}]})],
      },
      {
        text: 'Select a card, then **P** play, **A** attack, **E** ability, **D** DON!!.',
        keys: ['P', 'A', 'E', 'D'],
        shots: [desk('k-actions', {focus: ['actions'], pad: 36, ar: 1.5, rings: [{k: 'actions', pad: 6}]})],
      },
      {
        text: '**H** tucks the hand, **S** sorts it, **← →** pick a card.',
        keys: ['H', 'S', '←', '→'],
        shots: [cmp('h-sorted', {...handTight, rings: [{k: 'sort', pad: 5}]})],
      },
    ],
    tip: 'Press **?** in a match to see every shortcut.',
  },
  {
    id: 'spectate',
    title: 'Let friends watch your match',
    subtitle: 'Share one link and they watch live.',
    steps: [
      {
        text: 'Open **⋯** and tap **Copy spectate link**.',
        shots: [
          desk('m-menu', {focus: ['spectate'], pad: [60, 120, 30, 100], ar: 1.5, rings: [{k: 'spectate', pad: 4}], tag: 'Desktop'}),
          ph('p-menu', {focus: ['spectate', 'button'], pad: [20, 20, 20, 90], ar: 1.5, rings: [{k: 'spectate', pad: 4}]}),
        ],
      },
      {
        text: 'Paste the link to a friend. They open it and watch live.',
        chip: 'optcgduel.app/watch/yourRoom',
      },
      {
        text: 'Lobby: tap **Watch** by a friend, or **Spectate** with a room ID.',
        shots: [
          desk('fb-lobby', {focus: ['friendWatch'], pad: [330, 60, 30, 60], ar: 2.4, rings: [{k: 'friendWatch', pad: 5}]}),
          desk('watch-dialog', {focus: ['input', 'watch'], pad: [30, 70, 30, 30], ar: 2.0, rings: [{k: 'input', pad: 5}, {k: 'watch', pad: 5}]}),
        ],
      },
    ],
    tip: 'In casual rooms spectators see **both hands**. Ranked matches keep them hidden.',
  },
];
