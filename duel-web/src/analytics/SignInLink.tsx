import type { ReactNode } from "react";
import { googleLoginUrl } from "../net/api";
import { useSignInPromptShown } from "./useProductEvents";

/** A link to Google sign-in that records, once per time it appears, that a sign-in prompt was shown. */
export function SignInLink({ className, returnTo, children }: { className?: string; returnTo?: string; children: ReactNode }) {
  useSignInPromptShown(window.location.pathname);
  return (
    <a className={className} href={returnTo ? googleLoginUrl(returnTo) : googleLoginUrl()}>
      {children}
    </a>
  );
}
