import { createStore } from "./lib/createStore";

const openTitle = createStore<string | null>(null);

export const openFeedback = (title: string): void => openTitle.set(title);
export const closeFeedback = (): void => openTitle.set(null);
export const useOpenFeedbackTitle = (): string | null => openTitle.use();
