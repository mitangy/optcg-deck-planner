# @optcg/site-legal

The fan-project footer and the Terms & Credits, Privacy Policy and Cookies pages
shared by the planner (`frontend/`) and duel-web. Both apps list it as a
dependency (npm workspace) and compile it from source through its `exports`
map, like `@optcg/deck-analytics`.

It also owns the feedback dialog (`FeedbackDialog`) and the feedback payload and validation helpers (`src/feedback.ts`), which both apps use for the footer's feedback link.

The text lives in `src/content.tsx`. It describes what the apps actually
collect, so update it when that changes (new cookies, new storage, new third
parties). `LEGAL_DRAFT` shows a review banner on each page; turn it off once
the text has been reviewed.
