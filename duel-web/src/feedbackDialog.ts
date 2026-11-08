import { createStore } from "./lib/createStore";

/**
 * Which feedback dialog is open, if any. A tiny store so the match menu, the
 * footer, Settings and the lobby can all open the one dialog <FeedbackHost>
 * renders at the app root, without threading props through the board.
 */
const openTitle = createStore<string | null>(null);

export const openFeedback = (title: string): void => openTitle.set(title);
export const closeFeedback = (): void => openTitle.set(null);
export const useOpenFeedbackTitle = (): string | null => openTitle.use();
