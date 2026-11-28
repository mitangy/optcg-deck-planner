import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createAnalyticsBeforeSend } from "@optcg/ui/appShell";

const beforeSend = createAnalyticsBeforeSend();

/** Loaded after the first paint (main.tsx) so the two measurement scripts stay out of the entry chunk (#1501). */
export default function AnalyticsHost() {
  return (
    <>
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights beforeSend={beforeSend} />
    </>
  );
}
