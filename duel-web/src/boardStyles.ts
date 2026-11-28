// board.css and the sheets that sat right after it in the entry bundle load with the first screen that draws a board,
// not with the lobby (#1501). Keep this order: later sheets override earlier ones at equal specificity, so board.css must
// still come after the sheets that stay in main.tsx, and be followed by the board half of interactions.css, popupScale.css
// and the light-mode board rules (lightBoard.css repeats light.css so those keep winning over board.css).
import "./board.css";
import "./interactionsBoard.css";
import "./popupScale.css";
import "./lightBoard.css";
