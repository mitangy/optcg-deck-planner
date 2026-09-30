import type { BeforeSendEvent } from "@vercel/analytics/react";

/**
 * Keep secrets out of Vercel Analytics: the auth callback carries tokens in the
 * hash and invite links carry room codes in `?join=`, so only origin + path are sent.
 */
export function redactAnalyticsUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function analyticsBeforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
