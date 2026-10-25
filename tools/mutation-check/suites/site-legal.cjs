/** site-legal mutations (packages/site-legal/src, vitest): the feedback dialog both apps share, on the Headless UI Dialog (#714). */
const fb = "packages/site-legal/src/FeedbackDialog.tsx";
// A stand-in Dialog with no focus trap, Escape, outside click, focus return or aria wiring.
const bareDialog =
  'import type { ReactNode } from "react";\nconst Dialog = ({ className, panelClassName, children }: { open?: boolean; onClose?: () => void; className?: string; panelClassName?: string; children: ReactNode }) => (\n  <div className={className}>\n    <div className={panelClassName}>{children}</div>\n  </div>\n);\nconst DialogTitle = ({ className, children }: { className?: string; children: ReactNode }) => <h2 className={className}>{children}</h2>;';
module.exports = {
  cwd: "packages/site-legal",
  runner: "vitest",
  mutations: [
    {
      id: "feedback-dialog-not-a-dialog",
      file: fb,
      from: 'import { Dialog, DialogTitle } from "@optcg/ui/popups";',
      to: bareDialog,
      kills: [
        "opens as a modal named by its title with the cursor in the text box (#714)",
        "Tab off the last control wraps to the first, and Shift+Tab off the first to the last (#714)",
        "Escape closes it and focus returns to the button that opened it (#714)",
        "a click on the backdrop closes it, a click inside the card does not (#714)",
      ],
    },
    { id: "feedback-closes-while-sending", file: fb, from: "onClose={() => (sending ? undefined : onClose())}", to: "onClose={onClose}", kills: ["neither Escape nor the backdrop closes it while the message is sending (#714)"] },
    { id: "feedback-no-autofocus", file: fb, from: "    el?.focus();\n", to: "", kills: ["opens as a modal named by its title with the cursor in the text box (#714)"] },
    { id: "feedback-backdrop-click-ignored", file: fb, from: 'className="feedback-backdrop" panelClassName="feedback-card">', to: 'className="feedback-backdrop" panelClassName="feedback-card" closeOnOutsideClick={false}>', kills: ["a click on the backdrop closes it, a click inside the card does not (#714)"] },
    { id: "feedback-sent-focus-left-behind", file: fb, from: 'if (phase === "sent") closeRef.current?.focus();', to: "", kills: ["focus moves to Close once the message is sent, and Escape then closes it (#714)"] },
    { id: "feedback-title-unlinked", file: fb, from: '<DialogTitle className="feedback-title">{title}</DialogTitle>', to: '<h2 className="feedback-title">{title}</h2>', kills: ["opens as a modal named by its title with the cursor in the text box (#714)"] },
  ],
};
