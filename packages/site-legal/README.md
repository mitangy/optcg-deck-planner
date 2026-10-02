# @optcg/site-legal

The fan-project footer and the Terms & Credits, Privacy Policy and Cookies pages
shared by the planner (`frontend/`) and duel-web. Both apps compile it from
source through a Vite alias, like `@optcg/deck-analytics`.

The text lives in `src/content.tsx`. It describes what the apps actually
collect, so update it when that changes (new cookies, new storage, new third
parties). `LEGAL_DRAFT` shows a review banner on each page; turn it off once
the text has been reviewed.
