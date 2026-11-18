import { createAnalyticsBeforeSend } from "@optcg/ui/appShell";

/** Path segments after these prefixes are share/invite secrets, not page names. */
export const TOKEN_ROUTES = ["/share/", "/group-buy/join/", "/group-buy/view/"];

export const analyticsBeforeSend = createAnalyticsBeforeSend(TOKEN_ROUTES);
