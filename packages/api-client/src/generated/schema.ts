/**
 * Generated from the backend's OpenAPI schema. Do not edit.
 * Regenerate: node tools/ci/openapi-types.cjs (CI fails when this file is stale).
 */
export interface paths {
    "/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Root
         * @description Friendly landing for the raw Render URL (browsing / used to 404).
         */
        get: operations["root__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/bots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bots */
        get: operations["bots_admin_bots_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/cosmetics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Cosmetics
         * @description Every uploaded playmat and card back, newest first, for finding one nobody reported. No image bytes.
         *
         *     `before_id` pages by key (rows strictly older than it) so a take-down between pages skips nothing (#824).
         */
        get: operations["list_cosmetics_admin_cosmetics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/cosmetics/{cosmetic_id}/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cosmetic Image
         * @description The stored bytes, taken down or not (a takedown keeps them as evidence).
         */
        get: operations["cosmetic_image_admin_cosmetics__cosmetic_id__image_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/cosmetics/{cosmetic_id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore Taken Down Cosmetic
         * @description Undo an image takedown. The owner has to choose it as active again.
         */
        post: operations["restore_taken_down_cosmetic_admin_cosmetics__cosmetic_id__restore_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/cosmetics/{cosmetic_id}/take-down": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Take Down Uploaded Cosmetic
         * @description Remove an upload nobody reported (a copyright notice, say). Soft: the bytes stay as evidence.
         */
        post: operations["take_down_uploaded_cosmetic_admin_cosmetics__cosmetic_id__take_down_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/evals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record Eval
         * @description Lets the eval runner (npm run eval -- --post) record a run. Needs the analyst service secret.
         */
        post: operations["record_eval_admin_evals_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Admin List Events
         * @description Every event, newest start first, for the admin picker (#1019).
         */
        get: operations["admin_list_events_admin_events_get"];
        put?: never;
        /** Admin Create Event */
        post: operations["admin_create_event_admin_events_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Admin Latest Event
         * @description The newest event whatever the date, so the admin tab can still draw and forfeit weeks after the end (#795).
         */
        get: operations["admin_latest_event_admin_events_latest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Admin Event */
        get: operations["admin_event_admin_events__event_id__get"];
        put?: never;
        post?: never;
        /** Admin Delete Event */
        delete: operations["admin_delete_event_admin_events__event_id__delete"];
        options?: never;
        head?: never;
        /** Admin Update Event */
        patch: operations["admin_update_event_admin_events__event_id__patch"];
        trace?: never;
    };
    "/admin/events/{event_id}/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Admin Commit */
        post: operations["admin_commit_admin_events__event_id__commit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}/draw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Admin Draw */
        post: operations["admin_draw_admin_events__event_id__draw_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}/forfeit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Admin Forfeit */
        post: operations["admin_forfeit_admin_events__event_id__forfeit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}/participants.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Admin Event Csv */
        get: operations["admin_event_csv_admin_events__event_id__participants_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Feedback
         * @description What players rated Log Pose answers: counts over the last 30 days and the newest ratings first.
         */
        get: operations["list_feedback_admin_feedback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/feedback/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Feedback Export
         * @description Ratings for the analyst service (npm run feedback-cases): no player names, newest first. Needs the service secret.
         */
        get: operations["feedback_export_admin_feedback_export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/hosting": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Hosting */
        get: operations["hosting_admin_hosting_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/matches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Matches On Day
         * @description Every duel finished on one UTC day (oldest first, at most 200), for the drill-down under the matches chart (#691).
         *
         *     ``id`` is the match id the replay page takes (/replay/:matchId).
         */
        get: operations["matches_on_day_admin_matches_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Admin Me */
        get: operations["admin_me_admin_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Overview */
        get: operations["overview_admin_overview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reports */
        get: operations["list_reports_admin_reports_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}/ban": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ban Reported Player */
        post: operations["ban_reported_player_admin_reports__report_id__ban_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dismiss Report */
        post: operations["dismiss_report_admin_reports__report_id__dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report Image */
        get: operations["report_image_admin_reports__report_id__image_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}/remove-image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Remove Reported Image */
        post: operations["remove_reported_image_admin_reports__report_id__remove_image_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}/warn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Warn Reported Player */
        post: operations["warn_reported_player_admin_reports__report_id__warn_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/sync-catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Admin Sync Catalog
         * @description Enqueue a full catalog sync and return immediately (202).
         *
         *     The sync is long-running, so it runs as a background job instead of blocking
         *     this request (which would time out the caller and the free Render instance).
         */
        post: operations["admin_sync_catalog_admin_sync_catalog_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/sync-catalog/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Admin Sync Catalog Status
         * @description Report the background catalog sync state (guarded by the same token).
         */
        get: operations["admin_sync_catalog_status_admin_sync_catalog_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/traffic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Traffic
         * @description Vercel Web Analytics and Render metrics (#1020), read with the owner's tokens and cached for ten minutes.
         */
        get: operations["traffic_admin_traffic_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_admin_users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * User Detail
         * @description Everything staff may want to know about one account (#988).
         */
        get: operations["user_detail_admin_users__user_id__get"];
        put?: never;
        post?: never;
        /** Delete User */
        delete: operations["delete_user_admin_users__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}/ban": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ban User */
        post: operations["ban_user_admin_users__user_id__ban_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Set Role */
        put: operations["set_role_admin_users__user_id__role_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}/unban": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Unban User */
        post: operations["unban_user_admin_users__user_id__unban_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/free-spots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Free Spots
         * @description Owners change how many players are approved at once; spots already taken stay taken.
         */
        put: operations["put_free_spots_analyst_access_free_spots_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Access */
        post: operations["request_access_analyst_access_request_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Requests
         * @description Every request, pending first, then approved, then denied; newest first within each.
         */
        get: operations["list_requests_analyst_access_requests_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/requests/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decide Request */
        post: operations["decide_request_analyst_access_requests__user_id__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/requests/{user_id}/topup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Answer Topup
         * @description Owners grant a waiting top-up (+$5 for this month only) or dismiss it.
         */
        post: operations["answer_topup_analyst_access_requests__user_id__topup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/access/topup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Request Topup
         * @description A player out of credit asks owners for more. Asking again while it waits changes nothing.
         */
        post: operations["request_topup_analyst_access_topup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/bot-games": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Bot Games Route */
        get: operations["search_bot_games_route_analyst_bot_games_get"];
        put?: never;
        /**
         * Ingest Bot Games
         * @description Store a batch of self-play games. Sending the same batch id and indexes again adds nothing.
         */
        post: operations["ingest_bot_games_analyst_bot_games_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/bot-games/{game_id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bot Replay */
        get: operations["bot_replay_analyst_bot_games__game_id__replay_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/bot-lessons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Bot Lesson
         * @description A line bot games and real games agree on, saved as a draft for the admin. Once approved it reaches every player's Log Pose.
         */
        post: operations["post_bot_lesson_analyst_bot_lessons_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/briefs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Brief
         * @description The analyst saves a matchup brief for the ticket's leaders and deck (the ticket is checked again).
         */
        put: operations["put_brief_analyst_briefs_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/briefs/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Lookup Brief
         * @description What a matchup brief is about (from a game-server ticket) and the saved brief for it, if it is fresh.
         */
        post: operations["lookup_brief_analyst_briefs_lookup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/budget": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chat Budget
         * @description The analyst's check before (and, with `extra`, during) an answer: may this player ask, and which limit stops them.
         */
        get: operations["chat_budget_analyst_chat_budget_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/credit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chat Credit
         * @description The signed-in player's own credit and limits, for the panel's meter.
         */
        get: operations["chat_credit_analyst_chat_credit_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Chat Session
         * @description Whether the Log Pose panel is on for this player, and a fresh token for it when it is.
         *
         *     When it is off but players can ask for it, `access` says where their request stands.
         */
        post: operations["chat_session_analyst_chat_session_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Threads
         * @description The signed-in player's threads, newest first (one scope with ?scope=). A thread whose first answer never finished isn't listed.
         */
        get: operations["list_threads_analyst_chat_threads_get"];
        put?: never;
        /** Create Thread */
        post: operations["create_thread_analyst_chat_threads_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads/{thread_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * View Thread
         * @description One of the signed-in player's threads as the panel shows it.
         */
        get: operations["view_thread_analyst_chat_threads__thread_id__get"];
        put?: never;
        post?: never;
        /**
         * Delete Thread
         * @description A player deletes one of their threads: its messages and deck-edit cards go; its usage rows stay so cost totals don't change.
         */
        delete: operations["delete_thread_analyst_chat_threads__thread_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads/{thread_id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Thread Content
         * @description The thread exactly as stored, for the analyst to resend to the model.
         */
        get: operations["thread_content_analyst_chat_threads__thread_id__content_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads/{thread_id}/drafts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Save Drafts
         * @description The analyst keeps the new decks it built in a turn next to the thread, so their cards come back on reload (#726).
         *
         *     Each must come from a propose_new_deck call stored in this thread; repeats are ignored. They share the proposals table.
         */
        post: operations["save_drafts_analyst_chat_threads__thread_id__drafts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads/{thread_id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Append Messages
         * @description Add messages to the end of a thread. Stored messages are never changed.
         */
        post: operations["append_messages_analyst_chat_threads__thread_id__messages_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/threads/{thread_id}/proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Save Proposals
         * @description The analyst keeps the deck edits it suggested in a turn next to the thread, so their cards come back on reload (#400).
         *
         *     Each must come from a propose_deck_edit call stored in this thread; repeats are ignored.
         */
        post: operations["save_proposals_analyst_chat_threads__thread_id__proposals_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/chat/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record Usage */
        post: operations["record_usage_analyst_chat_usage_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/corpus/games": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Corpus Games
         * @description Search every shared game (anonymized) for the analyst service.
         */
        get: operations["corpus_games_analyst_corpus_games_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/corpus/games/{game_id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Corpus Replay */
        get: operations["corpus_replay_analyst_corpus_games__game_id__replay_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/decks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Decks
         * @description The player's deck planner decks.
         */
        get: operations["analyst_decks_analyst_decks_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Feedback
         * @description The signed-in player's own ratings on one thread's answers, or on one game's analysis, so the panel shows what they chose.
         */
        get: operations["my_feedback_analyst_feedback_get"];
        put?: never;
        /**
         * Put Feedback
         * @description Rate an answer. A second vote on the same answer replaces the first (rating and note).
         */
        post: operations["put_feedback_analyst_feedback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/human-bot-games": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Human Bot Games Route
         * @description Play vs Bot replays for the weekly value-model refit (#1202): paged by id, no player identifiers, opted-out players left out.
         */
        get: operations["human_bot_games_route_analyst_human_bot_games_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/lessons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Lessons
         * @description The link owner's lessons for Claude; approved ones unless asked otherwise. Bot lessons reach Claude through the sim stats instead.
         */
        get: operations["analyst_lessons_analyst_lessons_get"];
        put?: never;
        /**
         * Draft Lesson
         * @description Claude saves a lesson as a draft for the link owner to review. Evidence must be the owner's own games.
         */
        post: operations["draft_lesson_analyst_lessons_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/lessons/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review Lessons
         * @description The signed-in player's lessons, for the review list in duel-web Settings.
         */
        get: operations["review_lessons_analyst_lessons_review_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/lessons/review/{lesson_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Lesson */
        delete: operations["delete_lesson_analyst_lessons_review__lesson_id__delete"];
        options?: never;
        head?: never;
        /**
         * Review Lesson
         * @description Approve, reject or edit one of the player's own lessons.
         */
        patch: operations["review_lesson_analyst_lessons_review__lesson_id__patch"];
        trace?: never;
    };
    "/analyst/matches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Analyst Matches */
        get: operations["analyst_matches_analyst_matches_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/matches/{match_id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Replay
         * @description The full replay of one of the player's games. Only the analyst service may read it:
         *     it holds the opponent's hand and deck, and the analyst narrates it from the player's seat.
         */
        get: operations["analyst_replay_analyst_matches__match_id__replay_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whoami
         * @description Lets the analyst check a personal link before serving it.
         */
        get: operations["whoami_analyst_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/reviews/{match_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Review
         * @description The saved post-game analysis of one of the signed-in player's games.
         */
        get: operations["get_review_analyst_reviews__match_id__get"];
        /**
         * Put Review
         * @description The analyst saves a post-game analysis for a finished game the player was in.
         */
        put: operations["put_review_analyst_reviews__match_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/settings/model": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Model Setting
         * @description The model Log Pose runs on for everyone, and whether this player may change it.
         */
        get: operations["get_model_setting_analyst_settings_model_get"];
        /** Put Model Setting */
        put: operations["put_model_setting_analyst_settings_model_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/sharing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Sharing */
        get: operations["get_sharing_analyst_sharing_get"];
        /**
         * Put Sharing
         * @description Whether this player's games count toward Log Pose stats. Turning it off removes them from every aggregate.
         */
        put: operations["put_sharing_analyst_sharing_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/sim-games": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Sim Games
         * @description The player's imported games, newest first, without the combat logs.
         */
        get: operations["list_sim_games_analyst_sim_games_get"];
        put?: never;
        post?: never;
        /**
         * Clear Sim Games
         * @description Remove every game the player imported.
         */
        delete: operations["clear_sim_games_analyst_sim_games_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/sim-games/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Sim Games
         * @description Store the player's OPTCGSim games. Names are dropped; games already imported are skipped.
         */
        post: operations["import_sim_games_analyst_sim_games_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/sim-games/matchups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sim Game Matchups */
        get: operations["sim_game_matchups_analyst_sim_games_matchups_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/sim-games/{game_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Sim Game
         * @description One imported game with its combat log. Someone else's game is a 404, same as a missing one.
         */
        get: operations["get_sim_game_analyst_sim_games__game_id__get"];
        put?: never;
        post?: never;
        /** Delete Sim Game */
        delete: operations["delete_sim_game_analyst_sim_games__game_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/stats/matchups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Matchup Stats
         * @description Leader and matchup win rates from recorded duels (aggregates only), for the analyst service.
         */
        get: operations["analyst_matchup_stats_analyst_stats_matchups_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/stats/sim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Sim Stats
         * @description Simulated matchup win rates and line stats from bot self-play (aggregates only).
         */
        get: operations["analyst_sim_stats_analyst_stats_sim_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Token Status */
        get: operations["token_status_analyst_token_get"];
        put?: never;
        /**
         * Create Token
         * @description Make a new personal connector link. Any earlier link stops working.
         */
        post: operations["create_token_analyst_token_post"];
        /** Revoke Token */
        delete: operations["revoke_token_analyst_token_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/tournaments/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Tournament Stats
         * @description Leader and matchup results from Limitless TCG tournaments (no player names), for the analyst service.
         */
        get: operations["analyst_tournament_stats_analyst_tournaments_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/tournaments/sync-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analyst Tournament Sync Status
         * @description What the Limitless sync has stored, and how its last run went.
         */
        get: operations["analyst_tournament_sync_status_analyst_tournaments_sync_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analyst/usage/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Usage Summary
         * @description What Log Pose has cost, for owners: today, this month and all time, per player, and per kind and model.
         */
        get: operations["usage_summary_analyst_usage_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Google Callback */
        get: operations["google_callback_auth_callback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Claim Login */
        post: operations["claim_login_auth_claim_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/dev-login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dev Login
         * @description Local-only login. Disabled unless ENABLE_DEV_LOGIN=true.
         */
        post: operations["dev_login_auth_dev_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Google Login */
        get: operations["google_login_auth_google_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Me */
        get: operations["me_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me/username": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Set Username
         * @description Set or change the public duel username.
         *
         *     422 when the name fails validation, 409 when another account already holds
         *     it (case-insensitive). Re-submitting your own name with different casing is
         *     allowed.
         */
        patch: operations["set_username_auth_me_username_patch"];
        trace?: never;
    };
    "/auth/me/username-suggestion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Username Suggestion
         * @description An available username derived from the account name (prefill for the picker).
         */
        get: operations["username_suggestion_auth_me_username_suggestion_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cards/{card_id}/collector/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Collector Want
         * @description Set how many collector copies of an alt printing the user wants (0 removes).
         */
        put: operations["put_collector_want_cards__card_id__collector__product_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cards/{card_id}/printings/spread": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Card Art Spread
         * @description One of each art (#1292) across the decks (and shopping extra) holding the card.
         */
        put: operations["put_card_art_spread_cards__card_id__printings_spread_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cards/{card_id}/printings/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Card Printing
         * @description Set alt-art want across decks that include the card (shopping / group-buy sync).
         */
        put: operations["put_card_printing_cards__card_id__printings__product_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/cards": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog Cards
         * @description Search the card catalog by name, id, color, type, rarity, or set name.
         *
         *     With alts=true, alt-art printings are returned as their own rows.
         */
        get: operations["catalog_cards_catalog_cards_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/cards/{card_id}/price-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog Price History
         * @description Daily market price history of one art (product_id 0 = the card's base art). Public.
         */
        get: operations["catalog_price_history_catalog_cards__card_id__price_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/cards/{card_id}/printings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog Card Printings
         * @description All printings of a card number, so a scan can price the exact treatment.
         */
        get: operations["catalog_card_printings_catalog_cards__card_id__printings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/price-history/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Price History
         * @description Backfill one day of market prices (token-guarded, used by the backfill workflow).
         */
        post: operations["import_price_history_catalog_price_history_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/sales/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog Recent Sales
         * @description Public proxy for TCGPlayer latest sales (cached). Used by price expand UI.
         */
        get: operations["catalog_recent_sales_catalog_sales__product_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Catalog Status */
        get: operations["catalog_status_catalog_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Decks */
        get: operations["get_decks_decks_get"];
        put?: never;
        /** Post Deck */
        post: operations["post_deck_decks_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Deck
         * @description Optional deck_ids limits which other decks claim owned copies first (Separate per leader).
         */
        get: operations["get_deck_decks__deck_id__get"];
        put?: never;
        post?: never;
        /** Remove Deck */
        delete: operations["remove_deck_decks__deck_id__delete"];
        options?: never;
        head?: never;
        /** Rename Deck */
        patch: operations["rename_deck_decks__deck_id__patch"];
        trace?: never;
    };
    "/decks/{deck_id}/cards/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Deck Card */
        put: operations["put_deck_card_decks__deck_id__cards__card_id__put"];
        post?: never;
        /** Delete Deck Card */
        delete: operations["delete_deck_card_decks__deck_id__cards__card_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}/cards/{card_id}/printings/spread": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Deck Card Art Spread
         * @description One of each art (#1292): spread this deck's copies over the base art and every alt.
         */
        put: operations["put_deck_card_art_spread_decks__deck_id__cards__card_id__printings_spread_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}/cards/{card_id}/printings/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Deck Card Printing
         * @description Set how many copies of an alt printing are wanted in this deck (≤ Need).
         */
        put: operations["put_deck_card_printing_decks__deck_id__cards__card_id__printings__product_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}/decklist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Deck Decklist */
        put: operations["put_deck_decklist_decks__deck_id__decklist_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}/reset-owned": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reset Deck Owned
         * @description Zero Owned counts for every card that appears in this deck.
         */
        post: operations["reset_deck_owned_decks__deck_id__reset_owned_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/decks/{deck_id}/set-main": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set Deck Main
         * @description Mark this deck as Main for its leader; variants compare Additional Cards against it.
         */
        post: operations["set_deck_main_decks__deck_id__set_main_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/admin/game-server-pool": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Game Server Pool
         * @description Where new games go (ops admin token).
         */
        get: operations["get_game_server_pool_duel_admin_game_server_pool_get"];
        /**
         * Set Game Server Pool
         * @description Point new games at another game-server pool, or clear the pointer (ops admin token).
         *
         *     Games already running stay where they are; only tokens minted afterwards carry the new URL.
         */
        put: operations["set_game_server_pool_duel_admin_game_server_pool_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/card-reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Card Reports
         * @description Reports for triage, newest first (guarded by the ops admin token).
         *
         *     Pass ``status=all`` to include fixed and won't-fix reports.
         */
        get: operations["list_card_reports_duel_card_reports_get"];
        put?: never;
        /**
         * Create Card Report
         * @description Record a tester's report that a card does not play as printed.
         */
        post: operations["create_card_report_duel_card_reports_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/card-reports/{report_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Card Report
         * @description Mark a report open, fixed or won't-fix (ops admin token).
         */
        patch: operations["update_card_report_duel_card_reports__report_id__patch"];
        trace?: never;
    };
    "/duel/cosmetics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Cosmetics */
        get: operations["list_cosmetics_duel_cosmetics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/cosmetics/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Set Active Cosmetic */
        put: operations["set_active_cosmetic_duel_cosmetics_active_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/cosmetics/{cosmetic_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Cosmetic */
        delete: operations["delete_cosmetic_duel_cosmetics__cosmetic_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/cosmetics/{cosmetic_id}/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cosmetic Image */
        get: operations["cosmetic_image_duel_cosmetics__cosmetic_id__image_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/cosmetics/{cosmetic_id}/public/{sig}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Public Cosmetic Image
         * @description An image by its signed link, for opponents and the game server (no session needed).
         *
         *     Only links this API handed to the owner work: the id alone, or a wrong
         *     signature, is a 404 (the same answer as a deleted image).
         */
        get: operations["public_cosmetic_image_duel_cosmetics__cosmetic_id__public__sig__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/cosmetics/{kind}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload Cosmetic */
        post: operations["upload_cosmetic_duel_cosmetics__kind__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/decks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Decks */
        get: operations["list_decks_duel_decks_get"];
        /**
         * Put Decks
         * @description First-sign-in upload: the same last-writer-wins rule per deck.
         */
        put: operations["put_decks_duel_decks_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/decks/{deck_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Deck */
        put: operations["put_deck_duel_decks__deck_id__put"];
        post?: never;
        /** Delete Deck */
        delete: operations["delete_deck_duel_decks__deck_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/dev-token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mint Dev Token
         * @description Cookie-free token mint for Expo / duel-web when ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN.
         */
        post: operations["mint_dev_token_duel_dev_token_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/events/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Current
         * @description The lobby banner's event: live or upcoming, or one that ended in the last week.
         */
        get: operations["current_duel_events_current_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * By Id
         * @description One event by id at any time, so the rules page keeps the seed and eligible ids through the
         *     draw and the reply window long after the banner stops advertising it (#795).
         */
        get: operations["by_id_duel_events__event_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/events/{event_id}/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Join */
        post: operations["join_duel_events__event_id__join_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/guest-token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mint Guest Token
         * @description Always-on cookie-free mint keyed by a stable browser guest id (rating continuity).
         */
        post: operations["mint_guest_token_duel_guest_token_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/leaderboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Leaderboard */
        get: operations["leaderboard_duel_leaderboard_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Live Counts
         * @description Public headcount for the lobby: players online and matches in progress (counts only).
         */
        get: operations["live_counts_duel_live_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/matches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest Match */
        post: operations["ingest_match_duel_matches_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/matches/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Matches
         * @description The signed-in player's recent duels, newest first, with games that never finished.
         */
        get: operations["my_matches_duel_matches_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/matches/me/{match_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Match
         * @description One of the signed-in player's duels with their own turn-by-turn log (never the opponent's).
         */
        get: operations["my_match_duel_matches_me__match_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/matches/me/{match_id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Match Replay
         * @description The recording of one of the signed-in player's games, for the replay viewer.
         *
         *     It holds both hands and decks, so it goes only to the game's own players, and only once
         *     nobody is playing it any more. Finished games always qualify; a game that never sent a
         *     result qualifies after its room closed. The admin may open anyone's, for the admin page's
         *     matches list (#691); a game still being played stays hidden from them too.
         */
        get: operations["my_match_replay_duel_matches_me__match_id__replay_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/matches/{match_id}/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Ingest Match Progress
         * @description Keep the latest log of a game that has no result yet, so a game cut short still has one.
         *
         *     With Redis configured, live snapshots (one per turn) go to Redis only; the
         *     ``closed`` snapshot a closing room sends is written to Postgres so the log
         *     outlives Redis's expiry.
         */
        put: operations["ingest_match_progress_duel_matches__match_id__progress_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/presence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Ingest Presence
         * @description Replace one game-server process's presence rows with its latest snapshot.
         *
         *     The answer carries the images moderators took down in the last 15 minutes, so a running
         *     game server can blank them in live rooms (#810): ``{"takedowns": [{user_id, kind, cosmetic_id}]}``.
         */
        put: operations["ingest_presence_duel_presence_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/rating/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Rating */
        get: operations["my_rating_duel_rating_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Player Report */
        post: operations["create_player_report_duel_reports_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Settings For Me */
        get: operations["get_settings_for_me_duel_settings_get"];
        /** Put Settings For Me */
        put: operations["put_settings_for_me_duel_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/solo-games": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ingest Solo Game
         * @description Record a finished bot or practice game for the admin user page (#988). Idempotent on game_id.
         */
        post: operations["ingest_solo_game_duel_solo_games_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mint Token For Session */
        post: operations["mint_token_for_session_duel_token_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/warnings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Warnings
         * @description Warnings from moderators the player has not acknowledged yet, oldest first.
         */
        get: operations["my_warnings_duel_warnings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/duel/warnings/{warning_id}/ack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ack Warning */
        post: operations["ack_warning_duel_warnings__warning_id__ack_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Feedback
         * @description Feedback for triage, newest first (guarded by the ops admin token).
         *
         *     Pass ``status=all`` to include fixed and won't-fix items.
         */
        get: operations["list_feedback_feedback_get"];
        put?: never;
        /**
         * Create Feedback
         * @description Record a player's feedback (signed in via cookie or game token, or anonymous).
         */
        post: operations["create_feedback_feedback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/feedback/{feedback_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Feedback
         * @description Mark feedback open, fixed or won't-fix (ops admin token).
         */
        patch: operations["update_feedback_feedback__feedback_id__patch"];
        trace?: never;
    };
    "/friends": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Friends */
        get: operations["list_friends_friends_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/invites/{invite_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Dismiss Invite
         * @description Recipient dismisses (or has used) an invite; the sender may cancel it.
         */
        delete: operations["dismiss_invite_friends_invites__invite_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send Request */
        post: operations["send_request_friends_requests_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/requests/{other_id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept Request */
        post: operations["accept_request_friends_requests__other_id__accept_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/collection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Friend Collection */
        get: operations["friend_collection_friends__friend_id__collection_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/decks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Friend Decks */
        get: operations["friend_decks_friends__friend_id__decks_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/decks/{deck_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Friend Deck Detail */
        get: operations["friend_deck_detail_friends__friend_id__decks__deck_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/decks/{deck_id}/copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Copy Friend Deck */
        post: operations["copy_friend_deck_friends__friend_id__decks__deck_id__copy_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Friend Profile */
        get: operations["friend_profile_friends__friend_id__profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{friend_id}/spares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Friend Spares
         * @description `deck_ids` (the viewer's Include decks filter, #799) narrows only what the viewer needs.
         *     Spare copies still reserve every deck, so unticking a deck never offers its cards for trade.
         */
        get: operations["friend_spares_friends__friend_id__spares_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{other_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove Friend
         * @description Unfriend, decline an incoming request, or cancel an outgoing one.
         */
        delete: operations["remove_friend_friends__other_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/friends/{other_id}/invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Invite Friend */
        post: operations["invite_friend_friends__other_id__invite_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Group Buys */
        get: operations["get_group_buys_group_buys_get"];
        put?: never;
        /** Post Group Buy */
        post: operations["post_group_buy_group_buys_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/join/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Join Group Buy */
        post: operations["join_group_buy_group_buys_join__token__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Group Buy */
        get: operations["get_group_buy_group_buys__group_id__get"];
        put?: never;
        post?: never;
        /** Delete Group Buy */
        delete: operations["delete_group_buy_group_buys__group_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Complete Group Buy
         * @description Mark purchased without a receipt is blocked (use POST .../receipt/apply).
         */
        post: operations["complete_group_buy_group_buys__group_id__complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/contribution": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Group Buy Contribution */
        put: operations["put_group_buy_contribution_group_buys__group_id__contribution_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/export/tcgplayer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Group Buy Tcgplayer */
        get: operations["export_group_buy_tcgplayer_group_buys__group_id__export_tcgplayer_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/extras/{card_id}/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Group Buy Extra Skip */
        put: operations["put_group_buy_extra_skip_group_buys__group_id__extras__card_id___product_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Leave Group Buy */
        post: operations["leave_group_buy_group_buys__group_id__leave_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/lock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Lock Group Buy */
        post: operations["lock_group_buy_group_buys__group_id__lock_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark Group Buy Ordered
         * @description Mark ordered: record checkout handoff after lock (does not update Owned).
         */
        post: operations["mark_group_buy_ordered_group_buys__group_id__order_post"];
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Group Buy Order
         * @description Update order notes, shipping cost, and shipping split (host).
         */
        patch: operations["patch_group_buy_order_group_buys__group_id__order_patch"];
        trace?: never;
    };
    "/group-buys/{group_id}/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Group Buy Public */
        put: operations["put_group_buy_public_group_buys__group_id__public_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/quantities/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sync Group Buy Quantities */
        post: operations["sync_group_buy_quantities_group_buys__group_id__quantities_sync_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/quantities/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Group Buy Qty */
        put: operations["put_group_buy_qty_group_buys__group_id__quantities__card_id__put"];
        post?: never;
        /** Delete Group Buy Qty */
        delete: operations["delete_group_buy_qty_group_buys__group_id__quantities__card_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/receipt/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply Group Buy Receipt
         * @description Stage matched receipt copies onto Owned (partial OK); complete when pool is empty.
         */
        post: operations["apply_group_buy_receipt_group_buys__group_id__receipt_apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/receipt/match": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Match Group Buy Receipt
         * @description Parse a TCGPlayer receipt and compare line items to this group buy.
         *
         *     Hosts also persist the paste so Mark purchased still works after a refresh.
         */
        post: operations["match_group_buy_receipt_group_buys__group_id__receipt_match_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/receipt/undo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo Group Buy Receipt Apply
         * @description Undo the latest Mark purchased — restore snapshot, Owned, and status.
         */
        post: operations["undo_group_buy_receipt_apply_group_buys__group_id__receipt_undo_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/title": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Group Buy Title */
        put: operations["put_group_buy_title_group_buys__group_id__title_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/group-buys/{group_id}/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Unlock Group Buy */
        post: operations["unlock_group_buy_group_buys__group_id__unlock_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/sharing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get My Sharing */
        get: operations["get_my_sharing_me_sharing_get"];
        /** Put My Sharing */
        put: operations["put_my_sharing_me_sharing_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/spares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Spares */
        get: operations["my_spares_me_spares_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/trade-keep/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Trade Keep */
        put: operations["put_trade_keep_me_trade_keep__card_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/meta/cards/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Meta Card
         * @description A card's page (#953): printings plus its tournament usage. 404 when the catalog lacks the id.
         */
        get: operations["get_meta_card_meta_cards__card_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/meta/decks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Meta Decks */
        get: operations["get_meta_decks_meta_decks_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/meta/leaders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Meta Leaders */
        get: operations["get_meta_leaders_meta_leaders_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Notifications */
        get: operations["list_notifications_notifications_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark Notifications Read
         * @description Mark the given ids (or everything, when no ids are sent) as read. Only your own rows change.
         */
        post: operations["mark_notifications_read_notifications_read_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owned": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Owned
         * @description Cards the user owns, with estimated market value. deck_ids filters the Buying counts.
         */
        get: operations["get_owned_owned_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owned/add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Owned Add
         * @description Add copies to several cards at once (the Collection photo scan).
         */
        post: operations["post_owned_add_owned_add_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owned/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Owned */
        put: operations["put_owned_owned__card_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owned/{card_id}/display": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Display Art
         * @description Choose which art the card shows (null = automatic, 0 = base art).
         */
        put: operations["put_display_art_owned__card_id__display_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owned/{card_id}/printings/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Owned Printing
         * @description Set how many copies of an alt printing the user owns.
         */
        put: operations["put_owned_printing_owned__card_id__printings__product_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Preferences
         * @description Update per-user settings (e.g. how shopping Need combines decks).
         */
        patch: operations["patch_preferences_preferences_patch"];
        trace?: never;
    };
    "/price-alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Price Alerts */
        get: operations["list_price_alerts_price_alerts_get"];
        put?: never;
        /** Upsert Price Alert */
        post: operations["upsert_price_alert_price_alerts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/price-alerts/card/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Card Price Alerts */
        get: operations["list_card_price_alerts_price_alerts_card__card_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/price-alerts/{alert_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Price Alert */
        delete: operations["delete_price_alert_price_alerts__alert_id__delete"];
        options?: never;
        head?: never;
        /** Patch Price Alert */
        patch: operations["patch_price_alert_price_alerts__alert_id__patch"];
        trace?: never;
    };
    "/public/group-buys/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public Group Buy Invite */
        get: operations["public_group_buy_invite_public_group_buys__token__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/group-buys/{token}/view": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Public Group Buy View
         * @description Unauthenticated read-only group buy for anyone with the invite token.
         */
        get: operations["public_group_buy_view_public_group_buys__token__view_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/share/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Public Share
         * @description Read-only shopping/deck view for a share token; no sign-in needed.
         *
         *     A deck share shows owned counts from the viewer's collection when signed in (#741).
         */
        get: operations["get_public_share_public_share__token__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/share/{token}/copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Copy Shared Deck
         * @description Copy a shared deck into the signed-in viewer's decks (#741).
         */
        post: operations["post_copy_shared_deck_public_share__token__copy_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scan-samples": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Scan Samples
         * @description Store crops of the cards the user confirmed. Returns ``{saved: n}``.
         */
        post: operations["post_scan_samples_scan_samples_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scan-samples/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Scan Samples
         * @description Page of samples for the weekly retrain, guarded by ``X-Scan-Training-Token``.
         *
         *     Carries no user ids or emails.
         */
        get: operations["export_scan_samples_scan_samples_export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scan-samples/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get My Scan Samples */
        get: operations["get_my_scan_samples_scan_samples_mine_get"];
        put?: never;
        post?: never;
        /** Delete My Scan Samples */
        delete: operations["delete_my_scan_samples_scan_samples_mine_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Post Share */
        post: operations["post_share_share_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share/shopping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Shopping Share */
        get: operations["get_shopping_share_share_shopping_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Share */
        delete: operations["delete_share_share__token__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/shopping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Shopping
         * @description Optional deck_ids filters Need/Still Need to only the selected decks.
         *
         *     no_decks=true selects no decks at all (#1208): only added cards and Extra copies,
         *     whatever deck_ids says (a missing deck_ids still means every deck).
         *
         *     Cards added directly (no deck) are included whatever deck_ids selects;
         *     pass extras=false to leave them out. collector=false hides Extra copies
         *     (alt printings) but keeps owned alt copies held back for them (#1184).
         */
        get: operations["get_shopping_shopping_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/shopping/extras/{card_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Put Shopping Extra
         * @description Set the target copies to own for a card added straight to Master Shopping.
         */
        put: operations["put_shopping_extra_shopping_extras__card_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Tournaments */
        get: operations["list_tournaments_tournaments_get"];
        put?: never;
        /** Create Tournament */
        post: operations["create_tournament_tournaments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Tournament */
        get: operations["get_tournament_tournaments__code__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_tournaments__code__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Invite */
        post: operations["invite_tournaments__code__invite_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Join */
        post: operations["join_tournaments__code__join_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Leave */
        post: operations["leave_tournaments__code__leave_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/matches/{match_id}/award": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Award */
        post: operations["award_tournaments__code__matches__match_id__award_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/matches/{match_id}/play": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Play */
        post: operations["play_tournaments__code__matches__match_id__play_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/players/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove Player */
        delete: operations["remove_player_tournaments__code__players__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tournaments/{code}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start */
        post: operations["start_tournaments__code__start_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Trades */
        get: operations["list_trades_trades_get"];
        put?: never;
        /** Send Offer */
        post: operations["send_offer_trades_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Trade Summary */
        get: operations["trade_summary_trades_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept Offer */
        post: operations["accept_offer_trades__offer_id__accept_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply Offer */
        post: operations["apply_offer_trades__offer_id__apply_post"];
        /** Undo Offer Apply */
        delete: operations["undo_offer_apply_trades__offer_id__apply_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Offer */
        post: operations["cancel_offer_trades__offer_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Offer */
        post: operations["complete_offer_trades__offer_id__complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/counter": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Counter Offer */
        post: operations["counter_offer_trades__offer_id__counter_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/trades/{offer_id}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decline Offer */
        post: operations["decline_offer_trades__offer_id__decline_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AdminBots */
        AdminBots: {
            bot_games: components["schemas"]["BotGames"];
            /** Days */
            days: number;
            /** Evals */
            evals: components["schemas"]["EvalRun"][];
        };
        /** AdminCan */
        AdminCan: {
            /** Analytics */
            analytics: boolean;
            /** Ban */
            ban: boolean;
            /** Delete */
            delete: boolean;
            /** Set Roles */
            set_roles: boolean;
        };
        /** AdminDayMatches */
        AdminDayMatches: {
            /** Day */
            day: string;
            /** Matches */
            matches: components["schemas"]["DayMatch"][];
        };
        /** AdminEvent */
        AdminEvent: {
            /**
             * Best Of
             * @enum {integer}
             */
            best_of: 1 | 3;
            /** Bracket Size */
            bracket_size: number | null;
            counters: components["schemas"]["EventCounters"];
            /** Description */
            description: string;
            draw: components["schemas"]["EventDrawState"] | null;
            /** Ends At */
            ends_at: string;
            /**
             * Format
             * @enum {string}
             */
            format: "casual" | "single_elim" | "round_robin" | "swiss";
            /** Id */
            id: string;
            /** Min Games */
            min_games: number;
            /** Min Opponents */
            min_opponents: number;
            /** Min Turns */
            min_turns: number;
            /** Participants */
            participants: components["schemas"]["EventParticipant"][];
            /** Prize */
            prize: string;
            /** Prize Details */
            prize_details: string;
            /**
             * Prize Method
             * @enum {string}
             */
            prize_method: "draw" | "placement";
            /** Rules Version */
            rules_version: string;
            /** Starts At */
            starts_at: string;
            /**
             * Status
             * @enum {string}
             */
            status: "upcoming" | "live" | "ended" | "drawn";
            /** Title */
            title: string;
            /** Winners */
            winners: number;
            /** Winners Count */
            winners_count: number;
        };
        /** AdminEventDeleted */
        AdminEventDeleted: {
            /** Deleted */
            deleted: string;
        };
        /** AdminEventList */
        AdminEventList: {
            /** Events */
            events: components["schemas"]["AdminEventSummary"][];
        };
        /** AdminEventSummary */
        AdminEventSummary: {
            /** Ends At */
            ends_at: string;
            /**
             * Format
             * @enum {string}
             */
            format: "casual" | "single_elim" | "round_robin" | "swiss";
            /** Id */
            id: string;
            /** Joined */
            joined: number;
            /** Prize */
            prize: string;
            /** Starts At */
            starts_at: string;
            /**
             * Status
             * @enum {string}
             */
            status: "upcoming" | "live" | "ended" | "drawn";
            /** Title */
            title: string;
        };
        /** AdminFeedback */
        AdminFeedback: {
            counts: components["schemas"]["FeedbackCounts"];
            /** Days */
            days: number;
            /** Items */
            items: components["schemas"]["FeedbackItem"][];
        };
        /** AdminMe */
        AdminMe: {
            can: components["schemas"]["AdminCan"];
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "moderator" | "admin";
        };
        /** AdminOverview */
        AdminOverview: {
            accounts: components["schemas"]["OverviewAccounts"];
            active: components["schemas"]["OverviewActive"];
            /** Days */
            days: number;
            /** Generated At */
            generated_at: string;
            log_pose: components["schemas"]["OverviewLogPose"];
            matches: components["schemas"]["OverviewMatches"];
            /** Matches By Day */
            matches_by_day: components["schemas"]["MatchDay"][];
            planner: components["schemas"]["OverviewPlanner"];
            /** Signups By Day */
            signups_by_day: components["schemas"]["SignupDay"][];
            /** Top Leaders */
            top_leaders: components["schemas"]["LeaderCount"][];
            /** Top Leaders 30D */
            top_leaders_30d: components["schemas"]["LeaderCount"][];
        };
        /** AdminReports */
        AdminReports: {
            /** Reports */
            reports: components["schemas"]["ReportRow"][];
        };
        /** AdminUser */
        AdminUser: {
            /** Ban Reason */
            ban_reason: string | null;
            /** Banned At */
            banned_at: string | null;
            /** Created At */
            created_at: string;
            /** Email */
            email: string;
            games: components["schemas"]["GameCounts"];
            /** Id */
            id: number;
            /** Last Match At */
            last_match_at: string | null;
            /** Matches */
            matches: number;
            /** Name */
            name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "moderator" | "admin";
            signup_source: components["schemas"]["SignupSourceOut"] | null;
            /** Username */
            username: string | null;
        };
        /** AdminUserDetail */
        AdminUserDetail: {
            duel: components["schemas"]["UserDuel"];
            last_seen: components["schemas"]["LastSeen"];
            /** Last Seen At */
            last_seen_at: string | null;
            log_pose: components["schemas"]["UserLogPose"];
            moderation: components["schemas"]["UserModeration"];
            /** Modes */
            modes: components["schemas"]["UserModeTally"][];
            online: components["schemas"]["UserOnline"];
            planner: components["schemas"]["UserPlanner"];
            rating: components["schemas"]["UserRating"] | null;
            /** Recent Matches */
            recent_matches: components["schemas"]["AdminUserMatch"][];
            /** Solo Tracked Since */
            solo_tracked_since: string | null;
            /** Top Leaders */
            top_leaders: components["schemas"]["LeaderCount"][];
            user: components["schemas"]["AdminUser"];
        };
        /** AdminUserMatch */
        AdminUserMatch: {
            /** Bot Level */
            bot_level: string | null;
            /** Created At */
            created_at: string;
            /** Id */
            id: string;
            /** Leader Id */
            leader_id: string | null;
            /**
             * Mode
             * @enum {string}
             */
            mode: "ranked" | "friends" | "private" | "bot" | "practice";
            opponent: components["schemas"]["AdminUserMatchOpponent"] | null;
            /** Opponent Leader Id */
            opponent_leader_id: string | null;
            /** Reason */
            reason: string;
            /** Replay */
            replay: boolean;
            /** Turns */
            turns: number | null;
            /** Won */
            won: boolean | null;
        };
        /** AdminUserMatchOpponent */
        AdminUserMatchOpponent: {
            /** Id */
            id: number;
            /** Name */
            name: string;
        };
        /** AdminUsers */
        AdminUsers: {
            /** Total */
            total: number;
            /** Users */
            users: components["schemas"]["AdminUser"][];
        };
        /** AnalystAccessDecisionIn */
        AnalystAccessDecisionIn: {
            /**
             * Status
             * @enum {string}
             */
            status: "approved" | "denied";
        };
        /** AnalystAccessList */
        AnalystAccessList: {
            /** Free Spots */
            free_spots: number;
            /** Requests */
            requests: components["schemas"]["AnalystAccessRow"][];
            /** Spots Used */
            spots_used: number;
        };
        /** AnalystAccessRequestIn */
        AnalystAccessRequestIn: {
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AnalystAccessRequested */
        AnalystAccessRequested: {
            /**
             * Access
             * @enum {string}
             */
            access: "pending" | "approved";
        };
        /** AnalystAccessRow */
        AnalystAccessRow: {
            /**
             * Auto Approved
             * @default false
             */
            auto_approved: boolean;
            /** Created At */
            created_at?: string | null;
            /**
             * Credit Spent Usd
             * @default 0
             */
            credit_spent_usd: number;
            /** Credit Usd */
            credit_usd?: number | null;
            /** Decided At */
            decided_at?: string | null;
            /** Name */
            name: string;
            /** Note */
            note: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "approved" | "denied";
            /** Topup Requested At */
            topup_requested_at?: string | null;
            /** User Id */
            user_id: number;
        };
        /** AnalystAppendIn */
        AnalystAppendIn: {
            /** Messages */
            messages: components["schemas"]["AnalystStoredMessage"][];
        };
        /** AnalystBriefDeckLine */
        AnalystBriefDeckLine: {
            /** Copies */
            copies: number;
            /** Id */
            id: string;
        };
        /** AnalystBriefIn */
        AnalystBriefIn: {
            /** Citations */
            citations?: components["schemas"]["AnalystCitation"][];
            /** Text */
            text: string;
            /** Ticket */
            ticket: string;
            /** Variant */
            variant: string;
        };
        /** AnalystBriefLookupIn */
        AnalystBriefLookupIn: {
            /** Ticket */
            ticket: string;
            /** Variant */
            variant: string;
        };
        /** AnalystBriefLookupOut */
        AnalystBriefLookupOut: {
            brief?: components["schemas"]["AnalystBriefOut"] | null;
            /** Deck */
            deck: components["schemas"]["AnalystBriefDeckLine"][];
            /** Key */
            key: string;
            /** Leader Id */
            leader_id: string;
            /**
             * Match Id
             * @default
             */
            match_id: string;
            /** Opponent Id */
            opponent_id: string;
        };
        /** AnalystBriefOut */
        AnalystBriefOut: {
            /** Citations */
            citations?: components["schemas"]["AnalystCitation"][];
            /** Created At */
            created_at: string | null;
            /** Text */
            text: string;
        };
        /** AnalystChatBudget */
        AnalystChatBudget: {
            /** Allowed */
            allowed: boolean;
            /** Avg Chat Cost Usd */
            avg_chat_cost_usd?: number | null;
            /**
             * Credit Resets At
             * @default
             */
            credit_resets_at: string;
            /**
             * Credit Spent Usd
             * @default 0
             */
            credit_spent_usd: number;
            /** Credit Usd */
            credit_usd?: number | null;
            /** Daily Cap Usd */
            daily_cap_usd: number;
            /** Model */
            model: string;
            /** Monthly Cap Usd */
            monthly_cap_usd: number;
            /** Refusal */
            refusal?: ("credit" | "daily" | "monthly") | null;
            /** Spent Month Usd */
            spent_month_usd: number;
            /** Spent Today Usd */
            spent_today_usd: number;
            /**
             * Topup Requested
             * @default false
             */
            topup_requested: boolean;
        };
        /** AnalystChatSession */
        AnalystChatSession: {
            /** Access */
            access?: ("none" | "pending" | "denied") | null;
            /** Chat Url */
            chat_url?: string | null;
            /** Enabled */
            enabled: boolean;
            /** Expires At */
            expires_at?: string | null;
            /** Free Credit Usd */
            free_credit_usd?: number | null;
            /** Free Spots */
            free_spots?: number | null;
            /** Owner */
            owner?: boolean | null;
            /** Pending Requests */
            pending_requests?: number | null;
            /** Spots Left */
            spots_left?: number | null;
            /** Token */
            token?: string | null;
        };
        /**
         * AnalystCitation
         * @description A source cited in an answer: `at` is the UTF-16 offset in the answer's text the citation follows.
         */
        AnalystCitation: {
            /** At */
            at: number;
            /**
             * Cited Text
             * @default
             */
            cited_text: string;
            /** Source */
            source: string;
            /**
             * Title
             * @default
             */
            title: string;
        };
        /** AnalystDeckCard */
        AnalystDeckCard: {
            /** Copies */
            copies: number;
            /** Id */
            id: string;
        };
        /**
         * AnalystDeckDraft
         * @description A new deck Log Pose built for the player: the app opens its create-deck page with it filled in (#726).
         */
        AnalystDeckDraft: {
            /** Cards */
            cards: components["schemas"]["AnalystDraftCard"][];
            /** Count */
            count: number;
            /** Id */
            id: string;
            /** Leader Id */
            leader_id: string;
            /** Leader Name */
            leader_name: string;
            legality: components["schemas"]["AnalystDraftLegality"];
            /** Name */
            name: string;
            /** Summary */
            summary: string;
            /**
             * Version
             * @constant
             */
            version: 1;
        };
        /**
         * AnalystDeckEdit
         * @description A deck change Log Pose suggests for the deck open in an app, shown as an Apply card (#400).
         */
        AnalystDeckEdit: {
            /**
             * Apply
             * @default false
             */
            apply: boolean;
            /** Base */
            base?: components["schemas"]["AnalystDeckCard"][];
            /** Id */
            id: string;
            legality: components["schemas"]["AnalystDeckEditLegality"];
            /** Lines */
            lines: components["schemas"]["AnalystDeckEditLine"][];
            /** Summary */
            summary: string;
            target: components["schemas"]["AnalystDeckEditTarget"];
            /**
             * Version
             * @constant
             */
            version: 1;
        };
        /** AnalystDeckEditLegality */
        AnalystDeckEditLegality: {
            /** Ban List Checked */
            ban_list_checked: boolean;
            /** Count */
            count: number;
            /** Legal */
            legal: boolean;
            /** Problems */
            problems?: string[];
            /** Upcoming */
            upcoming?: string[];
        };
        /** AnalystDeckEditLine */
        AnalystDeckEditLine: {
            /** After */
            after: number;
            /** Before */
            before: number;
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Reason */
            reason: string;
        };
        /** AnalystDeckEditTarget */
        AnalystDeckEditTarget: {
            /** Leader Id */
            leader_id?: string | null;
            /** Name */
            name: string;
            /** Ref */
            ref: string;
        };
        /** AnalystDeckOut */
        AnalystDeckOut: {
            /** Cards */
            cards: components["schemas"]["AnalystDeckCard"][];
            /** Id */
            id: number;
            /** Leader Id */
            leader_id: string | null;
            /** Name */
            name: string;
        };
        /** AnalystDecksOut */
        AnalystDecksOut: {
            /** Decks */
            decks: components["schemas"]["AnalystDeckOut"][];
        };
        /** AnalystDisplayMessage */
        AnalystDisplayMessage: {
            /** Citations */
            citations?: components["schemas"]["AnalystCitation"][];
            /** Drafts */
            drafts?: components["schemas"]["AnalystDeckDraft"][];
            /** Proposals */
            proposals?: components["schemas"]["AnalystDeckEdit"][];
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "assistant";
            /** Text */
            text: string;
        };
        /** AnalystDraftCard */
        AnalystDraftCard: {
            /** Copies */
            copies: number;
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** AnalystDraftLegality */
        AnalystDraftLegality: {
            /** Ban List Checked */
            ban_list_checked: boolean;
            /** Legal */
            legal: boolean;
            /** Problems */
            problems?: string[];
            /** Upcoming */
            upcoming?: string[];
        };
        /** AnalystDraftsIn */
        AnalystDraftsIn: {
            /** Drafts */
            drafts: components["schemas"]["AnalystDeckDraft"][];
        };
        /** AnalystFreeSpots */
        AnalystFreeSpots: {
            /** Free Spots */
            free_spots: number;
            /** Spots Used */
            spots_used: number;
        };
        /** AnalystFreeSpotsIn */
        AnalystFreeSpotsIn: {
            /** Free Spots */
            free_spots: number;
        };
        /** AnalystLessonIn */
        AnalystLessonIn: {
            /** Cards */
            cards?: string[];
            /** Leader Id */
            leader_id?: string | null;
            /** Match Ids */
            match_ids?: string[];
            /** Opponent Id */
            opponent_id?: string | null;
            /** Text */
            text: string;
        };
        /** AnalystLessonOut */
        AnalystLessonOut: {
            /** Cards */
            cards: string[];
            /** Created At */
            created_at: string | null;
            /** Id */
            id: number;
            /** Leader Id */
            leader_id: string | null;
            /** Match Ids */
            match_ids: string[];
            /** Opponent Id */
            opponent_id: string | null;
            /** Reviewed At */
            reviewed_at: string | null;
            /**
             * Source
             * @default player
             */
            source: string;
            /** Status */
            status: string;
            /** Text */
            text: string;
        };
        /** AnalystLessonReview */
        AnalystLessonReview: {
            /** Status */
            status?: ("draft" | "approved" | "rejected") | null;
            /** Text */
            text?: string | null;
        };
        /** AnalystLessonsOut */
        AnalystLessonsOut: {
            /** Lessons */
            lessons: components["schemas"]["AnalystLessonOut"][];
        };
        /** AnalystModelIn */
        AnalystModelIn: {
            /** Model */
            model: string;
        };
        /** AnalystModelSetting */
        AnalystModelSetting: {
            /** Can Edit */
            can_edit: boolean;
            /** Model */
            model: string;
            /** Options */
            options: string[];
        };
        /** AnalystProposalsIn */
        AnalystProposalsIn: {
            /** Proposals */
            proposals: components["schemas"]["AnalystDeckEdit"][];
        };
        /** AnalystReplayOut */
        AnalystReplayOut: {
            /** Match Id */
            match_id: string;
            /** Replay */
            replay: {
                [key: string]: unknown;
            };
            /** Your Seat */
            your_seat: number;
        };
        /** AnalystReviewIn */
        AnalystReviewIn: {
            /** Citations */
            citations?: components["schemas"]["AnalystCitation"][];
            /** Text */
            text: string;
        };
        /** AnalystReviewOut */
        AnalystReviewOut: {
            /** Citations */
            citations?: components["schemas"]["AnalystCitation"][];
            /** Created At */
            created_at: string | null;
            /** Match Id */
            match_id: string;
            /** Text */
            text: string;
        };
        /** AnalystSharing */
        AnalystSharing: {
            /** Share Matches */
            share_matches: boolean;
        };
        /** AnalystStoredMessage */
        AnalystStoredMessage: {
            /** Content */
            content: string | {
                [key: string]: unknown;
            }[];
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "assistant";
        };
        /** AnalystThreadContent */
        AnalystThreadContent: {
            /** Id */
            id: number;
            /** Messages */
            messages: components["schemas"]["AnalystStoredMessage"][];
            /** Title */
            title: string;
        };
        /** AnalystThreadIn */
        AnalystThreadIn: {
            /**
             * Scope
             * @default general
             */
            scope: string;
            /**
             * Title
             * @default
             */
            title: string;
        };
        /** AnalystThreadSummary */
        AnalystThreadSummary: {
            /** Id */
            id: number;
            /** Scope */
            scope: string;
            /** Title */
            title: string;
            /** Updated At */
            updated_at: string | null;
        };
        /** AnalystThreadView */
        AnalystThreadView: {
            /** Id */
            id: number;
            /** Messages */
            messages: components["schemas"]["AnalystDisplayMessage"][];
            /** Scope */
            scope: string;
            /** Title */
            title: string;
        };
        /** AnalystThreadsOut */
        AnalystThreadsOut: {
            /** Threads */
            threads: components["schemas"]["AnalystThreadSummary"][];
        };
        /** AnalystTokenCreated */
        AnalystTokenCreated: {
            /** Connector Url */
            connector_url: string | null;
            /** Token */
            token: string;
        };
        /** AnalystTokenStatus */
        AnalystTokenStatus: {
            /** Created At */
            created_at: string | null;
            /** Has Token */
            has_token: boolean;
            /** Name */
            name?: string | null;
        };
        /** AnalystTopupDecisionIn */
        AnalystTopupDecisionIn: {
            /**
             * Action
             * @enum {string}
             */
            action: "add" | "dismiss";
        };
        /** AnalystUsageGroup */
        AnalystUsageGroup: {
            /** Cost Usd */
            cost_usd: number;
            /** Kind */
            kind: string;
            /** Model */
            model: string;
            /** Requests */
            requests: number;
        };
        /** AnalystUsageIn */
        AnalystUsageIn: {
            /**
             * Cache Read Tokens
             * @default 0
             */
            cache_read_tokens: number;
            /**
             * Cache Write Tokens
             * @default 0
             */
            cache_write_tokens: number;
            /** Cost Usd */
            cost_usd: number;
            /**
             * Duration Ms
             * @default 0
             */
            duration_ms: number;
            /**
             * Input Tokens
             * @default 0
             */
            input_tokens: number;
            /**
             * Kind
             * @enum {string}
             */
            kind: "chat" | "review" | "brief";
            /**
             * Model
             * @default
             */
            model: string;
            /**
             * Outcome
             * @default ok
             * @enum {string}
             */
            outcome: "ok" | "error" | "aborted" | "refused";
            /**
             * Output Tokens
             * @default 0
             */
            output_tokens: number;
            /** Refusal */
            refusal?: ("credit" | "daily" | "monthly" | "busy") | null;
            /** Thread Id */
            thread_id?: number | null;
            /**
             * Tool Calls
             * @default 0
             */
            tool_calls: number;
        };
        /** AnalystUsagePlayer */
        AnalystUsagePlayer: {
            /**
             * Credit Spent Usd
             * @default 0
             */
            credit_spent_usd: number;
            /** Credit Usd */
            credit_usd?: number | null;
            /** Last Used */
            last_used?: string | null;
            /** Name */
            name: string;
            /** Questions */
            questions: number;
            /** Refused */
            refused: number;
            /** Spent Usd */
            spent_usd: number;
            /** Threads */
            threads: number;
            /** User Id */
            user_id: number;
        };
        /** AnalystUsageSummary */
        AnalystUsageSummary: {
            /** Groups */
            groups: components["schemas"]["AnalystUsageGroup"][];
            /** Month Usd */
            month_usd: number;
            /** Players */
            players: components["schemas"]["AnalystUsagePlayer"][];
            /** Today Usd */
            today_usd: number;
            /** Total Usd */
            total_usd: number;
        };
        /** AwardIn */
        AwardIn: {
            /** Winner Id */
            winner_id: number;
        };
        /** BanIn */
        BanIn: {
            /** Reason */
            reason?: string | null;
        };
        /** BannedBy */
        BannedBy: {
            /** Id */
            id: number;
            /** Name */
            name: string;
        };
        /** BotBatchOut */
        BotBatchOut: {
            /** Accepted */
            accepted: number;
            /** Duplicates */
            duplicates: number;
            /** Rejected */
            rejected: components["schemas"]["BotRejected"][];
        };
        /** BotDay */
        BotDay: {
            /** Day */
            day: string;
            /** Finished */
            finished: number;
            /** Games */
            games: number;
        };
        /** BotGameIn */
        BotGameIn: {
            /** Index */
            index: number;
            /** Levels */
            levels?: string | null;
            /** Replay */
            replay: {
                [key: string]: unknown;
            };
            /** Tallies */
            tallies?: {
                [key: string]: unknown;
            }[] | {
                [key: string]: unknown;
            } | null;
            /** Turns */
            turns?: number | null;
        };
        /** BotGameSearchOut */
        BotGameSearchOut: {
            /** Games */
            games: components["schemas"]["BotGameSummary"][];
            /** Offset */
            offset: number;
            /** Source */
            source: string;
            /** Total */
            total: number;
        };
        /** BotGameSide */
        BotGameSide: {
            /** Leader */
            leader: string;
            /** Went First */
            went_first: boolean | null;
            /** Won */
            won: boolean | null;
        };
        /** BotGameSummary */
        BotGameSummary: {
            A: components["schemas"]["BotGameSide"];
            B: components["schemas"]["BotGameSide"];
            /** Date */
            date: string | null;
            /** Game Id */
            game_id: string;
            /** Has Replay */
            has_replay: boolean;
            /** Levels */
            levels: string;
            /** Rules Version */
            rules_version: string;
            sides: components["schemas"]["BotSideSeats"];
            /** Source */
            source: string;
            /** Turns */
            turns: number | null;
        };
        /** BotGames */
        BotGames: {
            /** Avg Turns */
            avg_turns: number | null;
            /** By Day */
            by_day: components["schemas"]["BotDay"][];
            /** Finished */
            finished: number;
            /** First Game At */
            first_game_at: string | null;
            /** First Seat Win Rate */
            first_seat_win_rate: number | null;
            /** Last Batch Id */
            last_batch_id: string | null;
            /** Last Game At */
            last_game_at: string | null;
            /** Leaders */
            leaders: number;
            /** Matchups */
            matchups: number;
            /** Total */
            total: number;
            /** Unfinished */
            unfinished: number;
        };
        /** BotGamesIn */
        BotGamesIn: {
            /** Batch Id */
            batch_id: string;
            /** Games */
            games: components["schemas"]["BotGameIn"][];
            /**
             * Levels
             * @default
             */
            levels: string;
        };
        /** BotLessonIn */
        BotLessonIn: {
            /** Cards */
            cards?: string[];
            /**
             * Evidence
             * @default
             */
            evidence: string;
            /** Leader Id */
            leader_id: string;
            /** Opponent Id */
            opponent_id?: string | null;
            /** Text */
            text: string;
        };
        /**
         * BotLessonSavedOut
         * @description `id` is only there for a lesson that was saved, not for a skipped duplicate.
         */
        BotLessonSavedOut: {
            /** Id */
            id?: number | null;
            /** Skipped */
            skipped: boolean;
        };
        /** BotRejected */
        BotRejected: {
            /** Index */
            index: number;
            /** Reason */
            reason: string;
        };
        /** BotReplayOut */
        BotReplayOut: {
            /** Date */
            date: string | null;
            /** Game Id */
            game_id: string;
            /** Levels */
            levels: string;
            /** Replay */
            replay: {
                [key: string]: unknown;
            };
            /** Rules Version */
            rules_version: string;
            sides: components["schemas"]["BotSideSeats"];
            /** Source */
            source: string;
        };
        /** BotSideSeats */
        BotSideSeats: {
            /** A */
            A: number;
            /** B */
            B: number;
        };
        /**
         * BotSimStatsOut
         * @description One of four shapes (all leaders, a mirror, a matchup, one leader); served with exclude_unset so a shape keeps only its own keys.
         */
        BotSimStatsOut: {
            /** Average Turns */
            average_turns?: number | null;
            /** Days */
            days?: number | null;
            /** Games */
            games?: number | null;
            /** Going First */
            going_first?: {
                [key: string]: unknown;
            } | null;
            /** Going Second */
            going_second?: {
                [key: string]: unknown;
            } | null;
            /** Interval */
            interval?: unknown;
            /** Label */
            label?: string | null;
            /** Leader */
            leader?: string | null;
            /** Leaders */
            leaders?: {
                [key: string]: unknown;
            }[] | null;
            /** Lessons */
            lessons?: {
                [key: string]: unknown;
            }[] | null;
            /** Levels */
            levels?: string | null;
            /** Lines */
            lines?: {
                [key: string]: unknown;
            }[] | null;
            /** Min Games */
            min_games?: number | null;
            /** Mirror */
            mirror?: boolean | null;
            /** Opponent */
            opponent?: string | null;
            /** Opponents */
            opponents?: {
                [key: string]: unknown;
            }[] | null;
            /** Overall */
            overall?: {
                [key: string]: unknown;
            } | null;
            /** Rules Versions */
            rules_versions?: {
                [key: string]: number;
            } | null;
            /** Source */
            source?: string | null;
            /** Too Few Games */
            too_few_games?: boolean | null;
            /** Total Games */
            total_games?: number | null;
            /** Win Rate */
            win_rate?: number | null;
            /** Wins */
            wins?: number | null;
        };
        /** CardArtSpreadResult */
        CardArtSpreadResult: {
            /** Card Id */
            card_id: string;
            /** Decks Updated */
            decks_updated: number;
        };
        /**
         * CardArtSpreadUpdate
         * @description "One of each art" across the user's decks that include the card (#1292).
         */
        CardArtSpreadUpdate: {
            /** Deck Ids */
            deck_ids?: number[] | null;
        };
        /** CardPrintingResult */
        CardPrintingResult: {
            /** Card Id */
            card_id: string;
            /** Decks Updated */
            decks_updated: number;
            /** Product Id */
            product_id: number;
            /** Qty */
            qty: number;
        };
        /**
         * CardPrintingUpdate
         * @description Set alt-art want across the user's decks that include the card (synced).
         */
        CardPrintingUpdate: {
            /** Deck Ids */
            deck_ids?: number[] | null;
            /** Qty */
            qty: number;
        };
        /**
         * CardReportIn
         * @description A tester's description of a card that does not play as printed.
         */
        CardReportIn: {
            /** Card Id */
            card_id: string;
            /**
             * Client Build
             * @default
             */
            client_build: string;
            /** Description */
            description: string;
            /**
             * Room Id
             * @default
             */
            room_id: string;
            /**
             * Source
             * @default
             */
            source: string;
        };
        /** CardReportOut */
        CardReportOut: {
            /** Card Id */
            card_id: string;
            /** Client Build */
            client_build: string;
            /** Created At */
            created_at: string;
            /** Description */
            description: string;
            /** Id */
            id: number;
            /** Reporter */
            reporter: string;
            /** Room Id */
            room_id: string;
            /** Source */
            source: string;
            /** Status */
            status: string;
            /** User Id */
            user_id: number | null;
        };
        /** CardReportStatusIn */
        CardReportStatusIn: {
            /** Status */
            status: string;
        };
        /** CardView */
        CardView: {
            /**
             * Alt Arts
             * @default []
             */
            alt_arts: components["schemas"]["PrintingView"][];
            /**
             * Alts Owned
             * @default 0
             */
            alts_owned: number;
            /**
             * Art Wants
             * @default []
             */
            art_wants: components["schemas"]["GroupBuyArtWantOut"][];
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Collector Want
             * @default 0
             */
            collector_want: number;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /** Display Art */
            display_art?: number | null;
            /**
             * Earlier Leaders
             * @default []
             */
            earlier_leaders: string[];
            /**
             * Earlier Leaders Need
             * @default 0
             */
            earlier_leaders_need: number;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Low Price */
            low_price?: number | null;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /** Needed */
            needed: number;
            /** Owned */
            owned: number;
            /** Product Id */
            product_id?: number | null;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /**
             * Section
             * @default main
             */
            section: string;
            /** Still Need */
            still_need: number;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
        };
        /** CatalogCardResult */
        CatalogCardResult: {
            /** Alt Product Id */
            alt_product_id?: number | null;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Group Name
             * @default
             */
            group_name: string;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Low Price */
            low_price?: number | null;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /**
             * Owned
             * @default 0
             */
            owned: number;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
        };
        /** CatalogStatus */
        CatalogStatus: {
            /** Card Count */
            card_count: number;
            /** Last Synced At */
            last_synced_at: string | null;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** ClaimBody */
        ClaimBody: {
            source?: components["schemas"]["SignupSource"] | null;
            /** Ticket */
            ticket: string;
        };
        /**
         * CollectorLine
         * @description One alt printing the user wants a collector copy of, on top of their decks (#1031).
         */
        CollectorLine: {
            /** Have */
            have: number;
            /** Image Url */
            image_url?: string | null;
            /** Label */
            label: string;
            /** Market Price */
            market_price?: number | null;
            /** Product Id */
            product_id: number;
            /** Remaining Cost */
            remaining_cost?: number | null;
            /** Still Need */
            still_need: number;
            /** Want */
            want: number;
        };
        /** CollectorWantResult */
        CollectorWantResult: {
            /** Card Id */
            card_id: string;
            /** Product Id */
            product_id: number;
            /** Qty */
            qty: number;
        };
        /**
         * CollectorWantUpdate
         * @description Set how many collector copies of an alt printing the user wants (0 removes).
         */
        CollectorWantUpdate: {
            /** Qty */
            qty: number;
        };
        /** CounterIn */
        CounterIn: {
            /** Lines */
            lines: components["schemas"]["TradeLineIn"][];
            /**
             * Message
             * @default
             */
            message: string;
        };
        /** DayMatch */
        DayMatch: {
            /** Created At */
            created_at: string | null;
            /** Id */
            id: string;
            /** Ranked */
            ranked: boolean;
            /** Seats */
            seats: components["schemas"]["DayMatchSeat"][];
            /** Turns */
            turns: number | null;
            /** Winner Seat */
            winner_seat: number | null;
        };
        /** DayMatchSeat */
        DayMatchSeat: {
            /** Leader Id */
            leader_id: string | null;
            /** Name */
            name: string | null;
            /** User Id */
            user_id: number;
            /** Won */
            won: boolean;
        };
        /**
         * DeckCardPrintingUpdate
         * @description Set how many copies of an alt printing are wanted in a deck (≤ card Need).
         */
        DeckCardPrintingUpdate: {
            /** Qty */
            qty: number;
        };
        /**
         * DeckCardUpsert
         * @description Set absolute copy count for a card in a deck. needed=0 removes the line.
         */
        DeckCardUpsert: {
            /**
             * Confirm Oversize
             * @default false
             */
            confirm_oversize: boolean;
            /** Needed */
            needed: number;
        };
        /** DeckCreate */
        DeckCreate: {
            /** Decklist */
            decklist: string;
            /** Name */
            name: string;
        };
        /** DeckDetail */
        DeckDetail: {
            /** Cards */
            cards: components["schemas"]["CardView"][];
            /**
             * Don Cards
             * @default 0
             */
            don_cards: number;
            /**
             * Hidden From Friends
             * @default false
             */
            hidden_from_friends: boolean;
            /** Id */
            id: number;
            /**
             * Is Main
             * @default false
             */
            is_main: boolean;
            /** Leader Card Id */
            leader_card_id: string | null;
            /** Leader Name */
            leader_name?: string | null;
            /**
             * Main Cards
             * @default 0
             */
            main_cards: number;
            /** Name */
            name: string;
            /**
             * Prior Decks
             * @default []
             */
            prior_decks: string[];
        };
        /**
         * DeckListReplace
         * @description PUT /decks/{id}/decklist: overwrite a deck's cards with a pasted code (#1016).
         */
        DeckListReplace: {
            /** Decklist */
            decklist: string;
        };
        /**
         * DeckOwnedResetResult
         * @description Result of zeroing Owned for every card that appears in a deck.
         */
        DeckOwnedResetResult: {
            deck: components["schemas"]["DeckDetail"];
            /** Deck Id */
            deck_id: number;
            /** Reset Count */
            reset_count: number;
        };
        /**
         * DeckRename
         * @description PATCH /decks/{id}: rename, hide from friends, or both (#703).
         */
        DeckRename: {
            /** Hidden From Friends */
            hidden_from_friends?: boolean | null;
            /** Name */
            name?: string | null;
        };
        /** DeckSummary */
        DeckSummary: {
            /** Card Count */
            card_count: number;
            /**
             * Don Cards
             * @default 0
             */
            don_cards: number;
            /**
             * Hidden From Friends
             * @default false
             */
            hidden_from_friends: boolean;
            /** Id */
            id: number;
            /**
             * Is Main
             * @default false
             */
            is_main: boolean;
            /** Leader Card Id */
            leader_card_id: string | null;
            /**
             * Leader Image Url
             * @default
             */
            leader_image_url: string;
            /** Leader Name */
            leader_name?: string | null;
            /**
             * Main Cards
             * @default 0
             */
            main_cards: number;
            /** Name */
            name: string;
            /**
             * Owned Copies
             * @default 0
             */
            owned_copies: number;
            /** Sort Order */
            sort_order: number;
            /** Total Cards */
            total_cards: number;
        };
        /** DisplayArtResult */
        DisplayArtResult: {
            /** Card Id */
            card_id: string;
            /** Product Id */
            product_id?: number | null;
        };
        /** DisplayArtUpdate */
        DisplayArtUpdate: {
            /** Product Id */
            product_id?: number | null;
        };
        /** DuelCosmeticActiveIn */
        DuelCosmeticActiveIn: {
            /** Id */
            id?: number | null;
            /** Kind */
            kind: string;
        };
        /** DuelCosmeticActiveOut */
        DuelCosmeticActiveOut: {
            /** Cardback */
            cardBack?: number | null;
            /** Playmat */
            playmat?: number | null;
        };
        /** DuelCosmeticOut */
        DuelCosmeticOut: {
            /** Created At */
            created_at: string;
            /** Id */
            id: number;
            /** Kind */
            kind: string;
            /** Public Path */
            public_path: string;
            /** Size */
            size: number;
        };
        /** DuelCosmeticsOut */
        DuelCosmeticsOut: {
            active: components["schemas"]["DuelCosmeticActiveOut"];
            /** Items */
            items: components["schemas"]["DuelCosmeticOut"][];
        };
        /** DuelDeckBody */
        DuelDeckBody: {
            /** Artprefs */
            artPrefs?: {
                [key: string]: string;
            } | null;
            /** Cards */
            cards: string[];
            /** Editedlocally */
            editedLocally?: boolean | null;
            /** Leaderid */
            leaderId: string;
            /** Name */
            name: string;
            /** Plannerart */
            plannerArt?: {
                [key: string]: string;
            } | null;
            /** Plannerdeckid */
            plannerDeckId?: number | null;
        };
        /** DuelDeckBulkItem */
        DuelDeckBulkItem: {
            deck: components["schemas"]["DuelDeckBody"];
            /** Id */
            id: string;
            /** Updatedat */
            updatedAt: number;
        };
        /** DuelDeckBulkPut */
        DuelDeckBulkPut: {
            /** Decks */
            decks: components["schemas"]["DuelDeckBulkItem"][];
        };
        /** DuelDeckOut */
        DuelDeckOut: {
            deck?: components["schemas"]["DuelDeckBody"] | null;
            /** Deleted */
            deleted: boolean;
            /** Id */
            id: string;
            /** Mergedinto */
            mergedInto?: string | null;
            /** Updatedat */
            updatedAt: number;
        };
        /** DuelDeckPut */
        DuelDeckPut: {
            deck: components["schemas"]["DuelDeckBody"];
            /** Updatedat */
            updatedAt: number;
        };
        /** DuelDecksOut */
        DuelDecksOut: {
            /** Decks */
            decks: components["schemas"]["DuelDeckOut"][];
        };
        /**
         * DuelDevTokenIn
         * @description Mint a game token for a local/dev user key (ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN).
         */
        DuelDevTokenIn: {
            /** User Key */
            user_key: string;
        };
        /**
         * DuelGuestTokenIn
         * @description Mint a game token for a stable browser guest id (always available).
         */
        DuelGuestTokenIn: {
            /** Guest Id */
            guest_id: string;
        };
        /** DuelInviteOut */
        DuelInviteOut: {
            /** Expires At */
            expires_at: number;
            /** From User Id */
            from_user_id: number;
            /** From Username */
            from_username: string;
            /** Id */
            id: number;
            /** Room Id */
            room_id: string;
            /** Server Url */
            server_url?: string | null;
        };
        /**
         * DuelLeaderboardEntryOut
         * @description Public rating data; account email is intentionally excluded.
         */
        DuelLeaderboardEntryOut: {
            /** Games Played */
            games_played: number;
            /** Name */
            name: string;
            /** Rating */
            rating: number;
            /** User Id */
            user_id: number;
            /** Username */
            username?: string | null;
        };
        /** DuelLeaderboardOut */
        DuelLeaderboardOut: {
            /** Entries */
            entries: components["schemas"]["DuelLeaderboardEntryOut"][];
        };
        /**
         * DuelLiveOut
         * @description Counts only: players online and matches in progress.
         */
        DuelLiveOut: {
            /** Matches */
            matches: number;
            /** Online */
            online: number;
        };
        /** DuelMatchDetailOut */
        DuelMatchDetailOut: {
            /** Log */
            log: {
                [key: string]: unknown;
            } | null;
            match: components["schemas"]["DuelMatchHistoryEntry"];
        };
        /** DuelMatchHistoryEntry */
        DuelMatchHistoryEntry: {
            /** Created At */
            created_at: string | null;
            /**
             * Finished
             * @default true
             */
            finished: boolean;
            /**
             * Has Chat
             * @default false
             */
            has_chat: boolean;
            /**
             * Has Log
             * @default false
             */
            has_log: boolean;
            /** Has Replay */
            has_replay: boolean;
            /** Match Id */
            match_id: string;
            /** Opponent Leader Id */
            opponent_leader_id: string | null;
            /** Opponent Name */
            opponent_name: string;
            /** Ranked */
            ranked: boolean;
            /** Rating After */
            rating_after: number;
            /** Rating Before */
            rating_before: number;
            /** Reason */
            reason: string;
            /**
             * Replay Ready
             * @default false
             */
            replay_ready: boolean;
            /** Turns */
            turns: number | null;
            /** Won */
            won: boolean;
            /** Your Leader Id */
            your_leader_id: string | null;
            /** Your Seat */
            your_seat: number;
        };
        /** DuelMatchHistoryOut */
        DuelMatchHistoryOut: {
            /** Matches */
            matches: components["schemas"]["DuelMatchHistoryEntry"][];
        };
        /** DuelMatchIngest */
        DuelMatchIngest: {
            /** Match Id */
            match_id: string;
            /**
             * Ranked
             * @default true
             */
            ranked: boolean;
            /**
             * Reason
             * @default unknown
             */
            reason: string;
            /** Replay */
            replay?: {
                [key: string]: unknown;
            } | null;
            /** Seat0 Leader Id */
            seat0_leader_id?: string | null;
            /** Seat0 User Id */
            seat0_user_id: number;
            /** Seat1 Leader Id */
            seat1_leader_id?: string | null;
            /** Seat1 User Id */
            seat1_user_id: number;
            /** Seat Logs */
            seat_logs?: {
                [key: string]: unknown;
            }[] | null;
            /** Turns */
            turns?: number | null;
            /** Winner Seat */
            winner_seat: number;
        };
        /** DuelMatchOut */
        DuelMatchOut: {
            /** Created */
            created: boolean;
            /** Match Id */
            match_id: string;
            /** Seat0 Rating After */
            seat0_rating_after: number;
            /** Seat0 Rating Before */
            seat0_rating_before: number;
            /** Seat1 Rating After */
            seat1_rating_after: number;
            /** Seat1 Rating Before */
            seat1_rating_before: number;
            /** Winner Seat */
            winner_seat: number;
        };
        /**
         * DuelMatchProgressIngest
         * @description A game still being played (or cut short): its log so far. Replaced every turn.
         */
        DuelMatchProgressIngest: {
            /**
             * Closed
             * @default false
             */
            closed: boolean;
            /**
             * Ranked
             * @default false
             */
            ranked: boolean;
            /** Replay */
            replay?: {
                [key: string]: unknown;
            } | null;
            /** Seat0 Leader Id */
            seat0_leader_id?: string | null;
            /** Seat0 User Id */
            seat0_user_id: number;
            /** Seat1 Leader Id */
            seat1_leader_id?: string | null;
            /** Seat1 User Id */
            seat1_user_id: number;
            /** Seat Logs */
            seat_logs?: {
                [key: string]: unknown;
            }[] | null;
            /** Turns */
            turns?: number | null;
        };
        /** DuelMatchReplayOut */
        DuelMatchReplayOut: {
            /** Finished */
            finished: boolean;
            /** Match Id */
            match_id: string;
            /** Players */
            players: string[];
            /** Replay */
            replay: {
                [key: string]: unknown;
            };
            /** Turns */
            turns: number | null;
            /** Your Seat */
            your_seat: number;
        };
        /** DuelPresenceEntry */
        DuelPresenceEntry: {
            /**
             * Phase
             * @default playing
             */
            phase: string;
            /**
             * Ranked
             * @default false
             */
            ranked: boolean;
            /**
             * Role
             * @default player
             */
            role: string;
            /** Room Id */
            room_id: string;
            /** Server Url */
            server_url?: string | null;
            /** User Id */
            user_id: number;
        };
        /**
         * DuelPresenceSnapshot
         * @description Full presence snapshot from one game-server process (replaces its prior rows).
         */
        DuelPresenceSnapshot: {
            /** Entries */
            entries?: components["schemas"]["DuelPresenceEntry"][];
            /** Instance Id */
            instance_id: string;
        };
        /** DuelRatingOut */
        DuelRatingOut: {
            /** Email */
            email: string;
            /** Games Played */
            games_played: number;
            /**
             * Losses
             * @default 0
             */
            losses: number;
            /** Name */
            name: string;
            /** Rank */
            rank?: number | null;
            /** Rating */
            rating: number;
            /** User Id */
            user_id: number;
            /** Username */
            username?: string | null;
            /**
             * Wins
             * @default 0
             */
            wins: number;
        };
        /** DuelSettingsIn */
        DuelSettingsIn: {
            /** Settings */
            settings: {
                [key: string]: string | boolean | number;
            };
        };
        /** DuelSettingsOut */
        DuelSettingsOut: {
            /** Settings */
            settings: {
                [key: string]: string | boolean | number;
            } | null;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * DuelSoloGameIngest
         * @description A finished bot or practice game, reported by the game server (#988).
         */
        DuelSoloGameIngest: {
            /** Bot Level */
            bot_level?: string | null;
            /** Game Id */
            game_id: string;
            /** Leader Id */
            leader_id?: string | null;
            /**
             * Mode
             * @enum {string}
             */
            mode: "bot" | "practice";
            /** Opponent Leader Id */
            opponent_leader_id?: string | null;
            /**
             * Reason
             * @default unknown
             */
            reason: string;
            /** Replay */
            replay?: {
                [key: string]: unknown;
            } | null;
            /** Turns */
            turns?: number | null;
            /** User Id */
            user_id: number;
            /** Won */
            won?: boolean | null;
        };
        /** DuelTokenOut */
        DuelTokenOut: {
            /**
             * Display Name
             * @default
             */
            display_name: string;
            /** Email */
            email: string;
            /** Expires At */
            expires_at: number;
            /** Game Server Url */
            game_server_url?: string | null;
            /** Games Played */
            games_played: number;
            /** Rating */
            rating: number;
            /** Token */
            token: string;
            /** User Id */
            user_id: number;
        };
        /** EvalGroup */
        EvalGroup: {
            /** Correct */
            correct: number;
            /** Total */
            total: number;
        };
        /** EvalGroupIn */
        EvalGroupIn: {
            /** Correct */
            correct: number;
            /** Total */
            total: number;
        };
        /** EvalRun */
        EvalRun: {
            /** Correct */
            correct: number | null;
            /** Groups */
            groups: {
                [key: string]: components["schemas"]["EvalGroup"];
            };
            /** Label */
            label: string;
            /** Lower Is Better */
            lower_is_better: boolean;
            /** Metric Name */
            metric_name: string | null;
            /** Metric Value */
            metric_value: number | null;
            /** Model */
            model: string;
            /** Notes */
            notes: string;
            /** Run At */
            run_at: string;
            /** Spend Usd */
            spend_usd: number | null;
            /**
             * Suite
             * @enum {string}
             */
            suite: "main" | "review_facts" | "puzzles" | "deck_advice";
            /** Total */
            total: number | null;
        };
        /** EvalRunIn */
        EvalRunIn: {
            /** Correct */
            correct?: number | null;
            /** Groups */
            groups?: {
                [key: string]: components["schemas"]["EvalGroupIn"];
            };
            /**
             * Label
             * @default
             */
            label: string;
            /**
             * Lower Is Better
             * @default false
             */
            lower_is_better: boolean;
            /** Metric Name */
            metric_name?: string | null;
            /** Metric Value */
            metric_value?: number | null;
            /**
             * Model
             * @default
             */
            model: string;
            /**
             * Notes
             * @default
             */
            notes: string;
            /** Run At */
            run_at?: string | null;
            /** Spend Usd */
            spend_usd?: number | null;
            /**
             * Suite
             * @default main
             * @enum {string}
             */
            suite: "main" | "review_facts" | "puzzles" | "deck_advice";
            /** Total */
            total?: number | null;
        };
        /** EventCounters */
        EventCounters: {
            /** Eligible */
            eligible: number;
            /** Flagged Eligible */
            flagged_eligible: number;
            /** Games In Window */
            games_in_window: number;
            /** Opted In */
            opted_in: number;
            /** Players With Game */
            players_with_game: number;
        };
        /** EventDrawState */
        EventDrawState: {
            /** Committed At */
            committed_at: string | null;
            /** Drawn At */
            drawn_at: string | null;
            /** Forfeited */
            forfeited: number[];
            /** Ranking */
            ranking: components["schemas"]["EventDrawee"][];
            /** Seed */
            seed: string | null;
            /** Seed Hash */
            seed_hash: string;
            /** Winners */
            winners: components["schemas"]["EventDrawee"][];
        };
        /** EventDrawee */
        EventDrawee: {
            /** Email */
            email: string;
            /** Forfeited */
            forfeited: boolean;
            /** Name */
            name: string;
            /** User Id */
            user_id: number;
        };
        /**
         * EventEnvelope
         * @description `event` is null when no event is live, upcoming or recently ended.
         */
        EventEnvelope: {
            event: components["schemas"]["EventPublic"] | null;
        };
        /** EventIn */
        EventIn: {
            /**
             * Best Of
             * @default 1
             */
            best_of: number;
            /** Bracket Size */
            bracket_size?: number | null;
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Ends At
             * Format: date-time
             */
            ends_at: string;
            /**
             * Format
             * @default casual
             */
            format: string;
            /**
             * Min Games
             * @default 3
             */
            min_games: number;
            /**
             * Min Opponents
             * @default 2
             */
            min_opponents: number;
            /**
             * Min Turns
             * @default 3
             */
            min_turns: number;
            /**
             * Prize
             * @default
             */
            prize: string;
            /**
             * Prize Details
             * @default
             */
            prize_details: string;
            /**
             * Prize Method
             * @default draw
             */
            prize_method: string;
            /**
             * Starts At
             * Format: date-time
             */
            starts_at: string;
            /** Title */
            title: string;
            /**
             * Winners
             * @default 3
             */
            winners: number;
        };
        /** EventJoined */
        EventJoined: {
            /** Opted In */
            opted_in: boolean;
        };
        /** EventParticipant */
        EventParticipant: {
            /** Eligible */
            eligible: boolean;
            /** Email */
            email: string;
            /** Excluded */
            excluded: ("guest" | "banned" | "staff") | null;
            /** Flags */
            flags: ("new_account" | "new_opponents" | "isolated_group" | "private_only")[];
            /** Games */
            games: number;
            /** Name */
            name: string;
            /** Opponents */
            opponents: number;
            /** User Id */
            user_id: number;
        };
        /** EventPatch */
        EventPatch: {
            /** Best Of */
            best_of?: number | null;
            /** Bracket Size */
            bracket_size?: number | null;
            /** Description */
            description?: string | null;
            /** Ends At */
            ends_at?: string | null;
            /** Format */
            format?: string | null;
            /** Min Games */
            min_games?: number | null;
            /** Min Opponents */
            min_opponents?: number | null;
            /** Min Turns */
            min_turns?: number | null;
            /** Prize */
            prize?: string | null;
            /** Prize Details */
            prize_details?: string | null;
            /** Prize Method */
            prize_method?: string | null;
            /** Starts At */
            starts_at?: string | null;
            /** Title */
            title?: string | null;
            /** Winners */
            winners?: number | null;
        };
        /** EventProgress */
        EventProgress: {
            /** Eligible */
            eligible: boolean;
            /** Games */
            games: number;
            /** Opponents */
            opponents: number;
        };
        /** EventPublic */
        EventPublic: {
            /**
             * Best Of
             * @enum {integer}
             */
            best_of: 1 | 3;
            /** Bracket Size */
            bracket_size: number | null;
            /** Can Join */
            can_join: boolean;
            /** Cant Join Reason */
            cant_join_reason: string | null;
            /** Description */
            description: string;
            /** Eligible User Ids */
            eligible_user_ids: number[] | null;
            /** Ends At */
            ends_at: string;
            /**
             * Format
             * @enum {string}
             */
            format: "casual" | "single_elim" | "round_robin" | "swiss";
            /** Id */
            id: string;
            /** Min Games */
            min_games: number;
            /** Min Opponents */
            min_opponents: number;
            /** Min Turns */
            min_turns: number;
            /** Opted In */
            opted_in: boolean;
            /** Prize */
            prize: string;
            /** Prize Details */
            prize_details: string;
            /**
             * Prize Method
             * @enum {string}
             */
            prize_method: "draw" | "placement";
            progress: components["schemas"]["EventProgress"] | null;
            /** Rules Version */
            rules_version: string;
            /** Seed */
            seed: string | null;
            /** Seed Hash */
            seed_hash: string | null;
            /** Starts At */
            starts_at: string;
            /**
             * Status
             * @enum {string}
             */
            status: "upcoming" | "live" | "ended" | "drawn";
            /** Title */
            title: string;
            /**
             * Viewer
             * @enum {string}
             */
            viewer: "anonymous" | "guest" | "staff" | "player";
            /** Winners */
            winners: number;
        };
        /** FeedbackCounts */
        FeedbackCounts: {
            /** Down */
            down: number;
            /** Up */
            up: number;
            /** Wrong */
            wrong: number;
        };
        /** FeedbackExport */
        FeedbackExport: {
            /** Items */
            items: components["schemas"]["FeedbackExportItem"][];
        };
        /**
         * FeedbackExportItem
         * @description A FeedbackItem without the player (user_id, user_name): what the analyst service reads.
         */
        FeedbackExportItem: {
            /** Answer Excerpt */
            answer_excerpt: string;
            /** Created At */
            created_at: string | null;
            /** Id */
            id: number;
            /**
             * Kind
             * @enum {string}
             */
            kind: "chat" | "review";
            /** Match Id */
            match_id: string | null;
            /** Message Index */
            message_index: number | null;
            /** Model */
            model: string;
            /** Note */
            note: string;
            /** Question */
            question: string;
            /**
             * Rating
             * @enum {string}
             */
            rating: "up" | "down" | "wrong";
            /** Thread Id */
            thread_id: number | null;
            /** Updated At */
            updated_at: string | null;
        };
        /** FeedbackItem */
        FeedbackItem: {
            /** Answer Excerpt */
            answer_excerpt: string;
            /** Created At */
            created_at: string | null;
            /** Id */
            id: number;
            /**
             * Kind
             * @enum {string}
             */
            kind: "chat" | "review";
            /** Match Id */
            match_id: string | null;
            /** Message Index */
            message_index: number | null;
            /** Model */
            model: string;
            /** Note */
            note: string;
            /** Question */
            question: string;
            /**
             * Rating
             * @enum {string}
             */
            rating: "up" | "down" | "wrong";
            /** Thread Id */
            thread_id: number | null;
            /** Updated At */
            updated_at: string | null;
            /** User Id */
            user_id: number;
            /** User Name */
            user_name: string | null;
        };
        /** FeedbackMine */
        FeedbackMine: {
            /** Votes */
            votes: components["schemas"]["FeedbackVote"][];
        };
        /** FeedbackOut */
        FeedbackOut: {
            /** App */
            app: string;
            /** Client Build */
            client_build: string;
            /** Created At */
            created_at: string;
            /** Github Issue */
            github_issue?: number | null;
            /** Id */
            id: number;
            /** Kind */
            kind: string;
            /** Message */
            message: string;
            /** Page */
            page: string;
            /** Reporter */
            reporter: string;
            /** Room Id */
            room_id: string;
            /** Status */
            status: string;
            /** User Agent */
            user_agent: string;
            /** User Id */
            user_id: number | null;
            /** Viewport */
            viewport: string;
        };
        /** FeedbackStatusIn */
        FeedbackStatusIn: {
            /** Status */
            status: string;
        };
        /** FeedbackVote */
        FeedbackVote: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "chat" | "review";
            /** Match Id */
            match_id?: string | null;
            /** Message Index */
            message_index?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
            /**
             * Rating
             * @enum {string}
             */
            rating: "up" | "down" | "wrong";
            /** Thread Id */
            thread_id?: number | null;
        };
        /** ForfeitIn */
        ForfeitIn: {
            /** User Id */
            user_id: number;
        };
        /** FriendCollectionOut */
        FriendCollectionOut: {
            /** Items */
            items: components["schemas"]["FriendOwnedItem"][];
            /** Total Copies */
            total_copies: number;
            /** Total Value */
            total_value?: number | null;
            /** Unique Cards */
            unique_cards: number;
        };
        /** FriendDeckCard */
        FriendDeckCard: {
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Market Price */
            market_price?: number | null;
            /**
             * My Owned
             * @default 0
             */
            my_owned: number;
            /**
             * My Still Need
             * @default 0
             */
            my_still_need: number;
            /** Name */
            name: string;
            /** Needed */
            needed: number;
            /**
             * Rarity
             * @default
             */
            rarity: string;
        };
        /** FriendDeckDetail */
        FriendDeckDetail: {
            /** Cards */
            cards: components["schemas"]["FriendDeckCard"][];
            /** Id */
            id: number;
            /** Leader Card Id */
            leader_card_id?: string | null;
            /**
             * Leader Image Url
             * @default
             */
            leader_image_url: string;
            /** Leader Name */
            leader_name?: string | null;
            /**
             * Main Cards
             * @default 0
             */
            main_cards: number;
            /**
             * My Missing Copies
             * @default 0
             */
            my_missing_copies: number;
            /** My Missing Cost */
            my_missing_cost?: number | null;
            /** Name */
            name: string;
        };
        /** FriendDeckSummary */
        FriendDeckSummary: {
            /** Id */
            id: number;
            /** Leader Card Id */
            leader_card_id?: string | null;
            /**
             * Leader Image Url
             * @default
             */
            leader_image_url: string;
            /** Leader Name */
            leader_name?: string | null;
            /**
             * Main Cards
             * @default 0
             */
            main_cards: number;
            /** Name */
            name: string;
            /**
             * Total Cards
             * @default 0
             */
            total_cards: number;
        };
        /** FriendInviteIn */
        FriendInviteIn: {
            /** Room Id */
            room_id: string;
            /** Server Url */
            server_url?: string | null;
        };
        /** FriendOut */
        FriendOut: {
            /**
             * Ranked
             * @default false
             */
            ranked: boolean;
            /** Room Id */
            room_id?: string | null;
            /** Server Url */
            server_url?: string | null;
            /** Status */
            status: string;
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
        };
        /** FriendOwnedItem */
        FriendOwnedItem: {
            /**
             * Alts Owned
             * @default 0
             */
            alts_owned: number;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /** Owned */
            owned: number;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /**
             * Spare
             * @default 0
             */
            spare: number;
            /** Value */
            value?: number | null;
        };
        /** FriendProfileOut */
        FriendProfileOut: {
            /** Collection Shared */
            collection_shared: boolean;
            /** Deck Count */
            deck_count?: number | null;
            /** Decks Shared */
            decks_shared: boolean;
            /** Spare Cards */
            spare_cards?: number | null;
            /** Total Copies */
            total_copies?: number | null;
            /** Total Value */
            total_value?: number | null;
            /** Trades Open */
            trades_open: boolean;
            /** Unique Cards */
            unique_cards?: number | null;
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
        };
        /** FriendRequestIn */
        FriendRequestIn: {
            /** Username */
            username: string;
        };
        /** FriendRequestOut */
        FriendRequestOut: {
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
        };
        /** FriendRequestResult */
        FriendRequestResult: {
            /** Status */
            status: string;
        };
        /** FriendSparesOut */
        FriendSparesOut: {
            /** Their Spares */
            their_spares: components["schemas"]["SpareItem"][];
            /** They Need */
            they_need: components["schemas"]["SpareItem"][];
            /** You Need */
            you_need: components["schemas"]["SpareItem"][];
        };
        /** FriendsOut */
        FriendsOut: {
            /** Friends */
            friends: components["schemas"]["FriendOut"][];
            /** Incoming */
            incoming: components["schemas"]["FriendRequestOut"][];
            /** Invites */
            invites: components["schemas"]["DuelInviteOut"][];
            /** Outgoing */
            outgoing: components["schemas"]["FriendRequestOut"][];
        };
        /** GameCounts */
        GameCounts: {
            /** Bot */
            bot: number;
            /** Friends */
            friends: number;
            /** Practice */
            practice: number;
            /** Private */
            private: number;
            /** Ranked */
            ranked: number;
        };
        /** GameServerPoolIn */
        GameServerPoolIn: {
            /** Url */
            url?: string | null;
        };
        /** GameServerPoolOut */
        GameServerPoolOut: {
            /** Game Server Url */
            game_server_url?: string | null;
            /** Pool Url */
            pool_url?: string | null;
        };
        /** GroupBuyArtWantOut */
        GroupBuyArtWantOut: {
            /** Product Id */
            product_id: number;
            /** Qty */
            qty: number;
            /** User Id */
            user_id: number;
        };
        /** GroupBuyContributionUpdate */
        GroupBuyContributionUpdate: {
            /** Deck Ids */
            deck_ids?: number[] | null;
            /** Include Extra Copies */
            include_extra_copies?: boolean | null;
            /** Include Singles */
            include_singles?: boolean | null;
        };
        /** GroupBuyCreate */
        GroupBuyCreate: {
            /** Deck Ids */
            deck_ids?: number[] | null;
            /**
             * Title
             * @default Group buy
             */
            title: string;
        };
        /** GroupBuyDetail */
        GroupBuyDetail: {
            /**
             * Can Undo Purchase
             * @default false
             */
            can_undo_purchase: boolean;
            /** Cards Still Needed */
            cards_still_needed: number;
            /**
             * Cards Subtotal
             * @default 0
             */
            cards_subtotal: number;
            /** Created At */
            created_at: string;
            /**
             * External Order Id
             * @default
             */
            external_order_id: string;
            /**
             * Grand Total
             * @default 0
             */
            grand_total: number;
            /**
             * Has Receipt
             * @default false
             */
            has_receipt: boolean;
            /** Host Name */
            host_name: string;
            /** Host User Id */
            host_user_id: number;
            /** Id */
            id: number;
            /** Invite Path */
            invite_path: string;
            /** Invite Token */
            invite_token: string;
            /** Is Host */
            is_host: boolean;
            /**
             * Is Public
             * @default false
             */
            is_public: boolean;
            /** Lines */
            lines: components["schemas"]["GroupBuyLineOut"][];
            /** Locked At */
            locked_at?: string | null;
            /** Member Count */
            member_count: number;
            /** Members */
            members: components["schemas"]["GroupBuyMemberOut"][];
            /**
             * Order Notes
             * @default
             */
            order_notes: string;
            /** Ordered At */
            ordered_at?: string | null;
            /** Public Path */
            public_path?: string | null;
            /**
             * Read Only
             * @default false
             */
            read_only: boolean;
            /**
             * Receipt Text
             * @default
             */
            receipt_text: string;
            /** Remaining Market */
            remaining_market: number;
            /**
             * Shipping Cost
             * @default 0
             */
            shipping_cost: number;
            /**
             * Shipping Split
             * @default equal
             */
            shipping_split: string;
            /** Status */
            status: string;
            /**
             * Tax Cost
             * @default 0
             */
            tax_cost: number;
            /** Title */
            title: string;
            /** Unique Cards */
            unique_cards: number;
        };
        /** GroupBuyExport */
        GroupBuyExport: {
            /** Copy Count */
            copy_count: number;
            /** Included Count */
            included_count: number;
            /** Missing Product Id */
            missing_product_id: number;
            /** Paste Text */
            paste_text: string;
            /** Status */
            status: string;
            /** Url */
            url?: string | null;
            /** With Product Id */
            with_product_id: number;
        };
        /** GroupBuyExtraSkipUpdate */
        GroupBuyExtraSkipUpdate: {
            /** Skip */
            skip: number;
        };
        /** GroupBuyInvitePreview */
        GroupBuyInvitePreview: {
            /** Host Name */
            host_name: string;
            /** Invite Token */
            invite_token: string;
            /**
             * Is Public
             * @default false
             */
            is_public: boolean;
            /** Member Count */
            member_count: number;
            /** Public Path */
            public_path?: string | null;
            /** Status */
            status: string;
            /** Title */
            title: string;
        };
        /** GroupBuyLineOut */
        GroupBuyLineOut: {
            /**
             * Alt Arts
             * @default []
             */
            alt_arts: components["schemas"]["PrintingView"][];
            /**
             * Art Wants
             * @default []
             */
            art_wants: components["schemas"]["GroupBuyArtWantOut"][];
            /**
             * Base Image Url
             * @default
             */
            base_image_url: string;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: string | null;
            /** Display Art */
            display_art?: number | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Market Price */
            market_price?: number | null;
            /** Members */
            members: components["schemas"]["GroupBuyMemberQtyOut"][];
            /**
             * My Deck Qty
             * @default 0
             */
            my_deck_qty: number;
            /**
             * My Excluded
             * @default false
             */
            my_excluded: boolean;
            /**
             * My Extras
             * @default []
             */
            my_extras: components["schemas"]["GroupBuyMyExtraOut"][];
            /**
             * My Is Custom
             * @default false
             */
            my_is_custom: boolean;
            /**
             * My Need
             * @default 0
             */
            my_need: number;
            /**
             * My Qty
             * @default 0
             */
            my_qty: number;
            /**
             * My Suggested Qty
             * @default 0
             */
            my_suggested_qty: number;
            /**
             * My Used In
             * @default []
             */
            my_used_in: string[];
            /** Name */
            name: string;
            /** Preferred Market Price */
            preferred_market_price?: number | null;
            /** Preferred Product Id */
            preferred_product_id?: number | null;
            /** Product Id */
            product_id?: number | null;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /** Remaining Cost */
            remaining_cost?: number | null;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
            /** Total Qty */
            total_qty: number;
        };
        /** GroupBuyMemberOut */
        GroupBuyMemberOut: {
            /**
             * Card Cost
             * @default 0
             */
            card_cost: number;
            /**
             * Cards Still Needed
             * @default 0
             */
            cards_still_needed: number;
            /** Deck Ids */
            deck_ids?: number[] | null;
            /** Display Name */
            display_name: string;
            /**
             * Include Extra Copies
             * @default false
             */
            include_extra_copies: boolean;
            /**
             * Include Singles
             * @default true
             */
            include_singles: boolean;
            /**
             * Remaining Market
             * @default 0
             */
            remaining_market: number;
            /** Role */
            role: string;
            /**
             * Shipping Share
             * @default 0
             */
            shipping_share: number;
            /** Sum Across Leaders */
            sum_across_leaders?: boolean | null;
            /**
             * Tax Share
             * @default 0
             */
            tax_share: number;
            /**
             * Total Owed
             * @default 0
             */
            total_owed: number;
            /** User Id */
            user_id: number;
        };
        /** GroupBuyMemberQtyOut */
        GroupBuyMemberQtyOut: {
            /** Display Name */
            display_name: string;
            /**
             * Is Custom
             * @default false
             */
            is_custom: boolean;
            /** Qty */
            qty: number;
            /**
             * Suggested Qty
             * @default 0
             */
            suggested_qty: number;
            /** User Id */
            user_id: number;
        };
        /**
         * GroupBuyMyExtraOut
         * @description One of the viewer's Extra copies on a card, and how many they leave out of this buy (#1269).
         */
        GroupBuyMyExtraOut: {
            /** Market Price */
            market_price?: number | null;
            /**
             * Name
             * @default
             */
            name: string;
            /** Product Id */
            product_id: number;
            /**
             * Skipped
             * @default 0
             */
            skipped: number;
            /**
             * Wanted
             * @default 0
             */
            wanted: number;
        };
        /** GroupBuyOrderUpdate */
        GroupBuyOrderUpdate: {
            /** External Order Id */
            external_order_id?: string | null;
            /** Order Notes */
            order_notes?: string | null;
            /** Shipping Cost */
            shipping_cost?: number | null;
            /** Shipping Split */
            shipping_split?: string | null;
            /** Tax Cost */
            tax_cost?: number | null;
        };
        /** GroupBuyPublicUpdate */
        GroupBuyPublicUpdate: {
            /** Is Public */
            is_public: boolean;
        };
        /** GroupBuyQtyUpdate */
        GroupBuyQtyUpdate: {
            /** Qty */
            qty: number;
        };
        /** GroupBuyReceiptApplyRequest */
        GroupBuyReceiptApplyRequest: {
            /**
             * Allow Partial
             * @default true
             */
            allow_partial: boolean;
            /** Card Ids */
            card_ids?: string[] | null;
            /** Receipt Text */
            receipt_text: string;
        };
        /** GroupBuyReceiptLineOut */
        GroupBuyReceiptLineOut: {
            /** Card Id */
            card_id: string;
            /**
             * Confidence
             * @default
             */
            confidence: string;
            /**
             * Descriptions
             * @default []
             */
            descriptions: string[];
            /**
             * Group Name
             * @default
             */
            group_name: string;
            /** Name */
            name: string;
            /** Needed Qty */
            needed_qty: number;
            /** Product Id */
            product_id?: number | null;
            /** Receipt Qty */
            receipt_qty: number;
            /**
             * Staged Qty
             * @default 0
             */
            staged_qty: number;
            /** Status */
            status: string;
        };
        /** GroupBuyReceiptMatchReport */
        GroupBuyReceiptMatchReport: {
            /** Can Apply Full */
            can_apply_full: boolean;
            /** Can Apply Partial */
            can_apply_partial: boolean;
            /** Lines */
            lines: components["schemas"]["GroupBuyReceiptLineOut"][];
            /** Summary */
            summary: {
                [key: string]: number;
            };
            /** Unmatched */
            unmatched: components["schemas"]["GroupBuyReceiptUnmatchedOut"][];
        };
        /** GroupBuyReceiptMatchRequest */
        GroupBuyReceiptMatchRequest: {
            /** Receipt Text */
            receipt_text: string;
        };
        /** GroupBuyReceiptUnmatchedOut */
        GroupBuyReceiptUnmatchedOut: {
            /**
             * Card Name
             * @default
             */
            card_name: string;
            /** Description */
            description: string;
            /** Qty */
            qty: number;
            /**
             * Set Name
             * @default
             */
            set_name: string;
        };
        /** GroupBuySummary */
        GroupBuySummary: {
            /** Cards Still Needed */
            cards_still_needed: number;
            /** Created At */
            created_at: string;
            /** Host Name */
            host_name: string;
            /** Host User Id */
            host_user_id: number;
            /** Id */
            id: number;
            /** Invite Path */
            invite_path: string;
            /** Invite Token */
            invite_token: string;
            /** Is Host */
            is_host: boolean;
            /**
             * Is Public
             * @default false
             */
            is_public: boolean;
            /** Member Count */
            member_count: number;
            /** Public Path */
            public_path?: string | null;
            /** Remaining Market */
            remaining_market: number;
            /** Status */
            status: string;
            /** Title */
            title: string;
            /** Unique Cards */
            unique_cards: number;
        };
        /** GroupBuyTitleUpdate */
        GroupBuyTitleUpdate: {
            /** Title */
            title: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * HostingOut
         * @description Each provider is `{"configured": false}`, `{"configured": true, "error": ...}` or its data; the shapes differ per provider.
         */
        HostingOut: {
            /** Github */
            github: {
                [key: string]: unknown;
            };
            /** Render */
            render: {
                [key: string]: unknown;
            };
            /** Vercel */
            vercel: {
                [key: string]: unknown;
            };
        };
        /**
         * HumanBotGameOut
         * @description One Play vs Bot game for training: no player identifiers, only the bot's level and the replay.
         */
        HumanBotGameOut: {
            /** Bot Level */
            bot_level: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: number;
            /** Replay */
            replay: {
                [key: string]: unknown;
            };
        };
        /** HumanBotGamesOut */
        HumanBotGamesOut: {
            /** Games */
            games: components["schemas"]["HumanBotGameOut"][];
            /** Next After Id */
            next_after_id: number;
        };
        /** InviteIn */
        InviteIn: {
            /** User Id */
            user_id: number;
        };
        /** JoinIn */
        JoinIn: {
            /**
             * Accept Rules
             * @default false
             */
            accept_rules: boolean;
            /**
             * Rules Version
             * @default
             */
            rules_version: string;
        };
        /** LastSeen */
        LastSeen: {
            /** Lobby */
            lobby: string | null;
            /** Log Pose */
            log_pose: string | null;
            /** Match */
            match: string | null;
            /** Solo */
            solo: string | null;
        };
        /** LeaderCount */
        LeaderCount: {
            /** Games */
            games: number;
            /** Leader Id */
            leader_id: string;
            /** Wins */
            wins: number;
        };
        /** LeaderNeed */
        LeaderNeed: {
            /** Label */
            label: string;
            /** Need */
            need: number;
        };
        /** MatchDay */
        MatchDay: {
            /** Casual */
            casual: number;
            /** Day */
            day: string;
            /** Ranked */
            ranked: number;
        };
        /** MatchOut */
        MatchOut: {
            a: components["schemas"]["PersonOut"] | null;
            b: components["schemas"]["PersonOut"] | null;
            /** Decided By */
            decided_by: string | null;
            /** Host Id */
            host_id: number | null;
            /** Id */
            id: number;
            /** Result Match Id */
            result_match_id: string | null;
            /** Room Open */
            room_open: boolean;
            /** Round */
            round: number;
            /** Slot */
            slot: number;
            /** Status */
            status: string;
            /** Winner Id */
            winner_id: number | null;
        };
        /** MeOut */
        MeOut: {
            /** Can Join */
            can_join: boolean;
            /** Can Start */
            can_start: boolean;
            /** Role */
            role: string | null;
            /** User Id */
            user_id: number;
        };
        /** MetaCard */
        MetaCard: {
            /** Card Id */
            card_id: string;
            /** Card Type */
            card_type: string;
            /** Color */
            color: string;
            /** Cost */
            cost: string | null;
            /** Group Name */
            group_name: string;
            /** Image Url */
            image_url: string;
            /** Market Price */
            market_price: number | null;
            /** Name */
            name: string;
            /** Rarity */
            rarity: string;
            /** Tcgplayer Url */
            tcgplayer_url: string;
        };
        /** MetaCardDetail */
        MetaCardDetail: {
            card: components["schemas"]["MetaCard"];
            /** Printings */
            printings: components["schemas"]["MetaPrinting"][];
            usage: components["schemas"]["MetaCardUsage"];
        };
        /** MetaCardLeader */
        MetaCardLeader: {
            /** Average Copies */
            average_copies: number;
            /** Color */
            color: string;
            /** Decks With Card */
            decks_with_card: number;
            /** Image Url */
            image_url: string;
            /** Leader Decks */
            leader_decks: number;
            /** Leader Id */
            leader_id: string;
            /** Name */
            name: string;
            /** Rate */
            rate: number;
        };
        /** MetaCardTopDeck */
        MetaCardTopDeck: {
            /** Copies */
            copies: number;
            /** Date */
            date: string;
            /** Event */
            event: string;
            /** Event Url */
            event_url: string;
            /** Id */
            id: number;
            /** Leader Id */
            leader_id: string;
            /** Leader Image Url */
            leader_image_url: string;
            /** Leader Name */
            leader_name: string;
            /** Placing */
            placing: number | null;
            /** Players */
            players: number;
            record: components["schemas"]["MetaRecord"];
        };
        /** MetaCardUsage */
        MetaCardUsage: {
            /** Average Copies */
            average_copies: number | null;
            /** Days */
            days: number;
            /** Decks With Card */
            decks_with_card: number;
            /** Events */
            events: number;
            /** Is Leader */
            is_leader: boolean;
            /** Leaders */
            leaders: components["schemas"]["MetaCardLeader"][];
            /** Min Players */
            min_players: number;
            /** Rate */
            rate: number;
            /** Source */
            source: string;
            /** Source Url */
            source_url: string;
            /** Top Decks */
            top_decks: components["schemas"]["MetaCardTopDeck"][];
            /** Total Decks */
            total_decks: number;
        };
        /** MetaDeck */
        MetaDeck: {
            /** Card Count */
            card_count: number;
            /** Cards */
            cards: components["schemas"]["MetaDeckCard"][];
            /** Date */
            date: string;
            /** Event */
            event: string;
            /** Event Id */
            event_id: string;
            /** Event Url */
            event_url: string;
            /** Id */
            id: number;
            /** Placing */
            placing: number | null;
            /** Players */
            players: number;
            record: components["schemas"]["MetaRecord"];
            /** Set Label */
            set_label: string | null;
            /** Text */
            text: string;
        };
        /** MetaDeckCard */
        MetaDeckCard: {
            /** Card Id */
            card_id: string;
            /** Card Type */
            card_type: string;
            /** Cost */
            cost: string;
            /** Count */
            count: number;
            /** Image Url */
            image_url: string;
            /** Name */
            name: string;
        };
        /** MetaDecks */
        MetaDecks: {
            /** Decks */
            decks: components["schemas"]["MetaDeck"][];
            /** Image Url */
            image_url: string;
            /** Leader Id */
            leader_id: string;
            /** Name */
            name: string;
        };
        /** MetaLeader */
        MetaLeader: {
            /** Color */
            color: string;
            /** Decks */
            decks: number;
            /** Image Url */
            image_url: string;
            /** Leader Id */
            leader_id: string;
            /** Losses */
            losses: number;
            /** Name */
            name: string;
            /** Share */
            share: number;
            /** Ties */
            ties: number;
            /** Top8 */
            top8: number;
            /** Win Rate */
            win_rate: number | null;
            /** Wins */
            wins: number;
        };
        /** MetaLeaders */
        MetaLeaders: {
            /** Days */
            days: number;
            /** Events */
            events: number;
            /** Leaders */
            leaders: components["schemas"]["MetaLeader"][];
            /** Min Players */
            min_players: number;
            /** Source */
            source: string;
            /** Source Url */
            source_url: string;
            /** Total Decks */
            total_decks: number;
        };
        /** MetaPrinting */
        MetaPrinting: {
            /** Group Name */
            group_name: string;
            /** Image Url */
            image_url: string;
            /** Is Special */
            is_special: boolean;
            /** Market Price */
            market_price: number | null;
            /** Name */
            name: string;
            /** Product Id */
            product_id: number;
            /** Tcgplayer Url */
            tcgplayer_url: string;
        };
        /** MetaRecord */
        MetaRecord: {
            /** Losses */
            losses: number;
            /** Ties */
            ties: number;
            /** Wins */
            wins: number;
        };
        /** MySpareItem */
        MySpareItem: {
            /**
             * Base Owned
             * @default 0
             */
            base_owned: number;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /**
             * Keep Qty
             * @default 0
             */
            keep_qty: number;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /**
             * Printings
             * @default []
             */
            printings: components["schemas"]["SparePrinting"][];
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /** Spare */
            spare: number;
            /**
             * Want
             * @default 0
             */
            want: number;
        };
        /** MySparesOut */
        MySparesOut: {
            /** Items */
            items: components["schemas"]["MySpareItem"][];
        };
        /** NotificationList */
        NotificationList: {
            /** Items */
            items: components["schemas"]["NotificationOut"][];
            /** Unread */
            unread: number;
        };
        /** NotificationOut */
        NotificationOut: {
            /** Body */
            body: string;
            /** Card Id */
            card_id?: string | null;
            /** Created At */
            created_at?: string | null;
            /** Id */
            id: number;
            /** Kind */
            kind: string;
            /** Link */
            link?: string | null;
            /** Price */
            price?: number | null;
            /** Product Id */
            product_id?: number | null;
            /** Read At */
            read_at?: string | null;
            /** Title */
            title: string;
        };
        /** NotificationsRead */
        NotificationsRead: {
            /** Ids */
            ids?: number[] | null;
        };
        /** OverviewAccounts */
        OverviewAccounts: {
            /** Banned */
            banned: number;
            /** Guests */
            guests: number;
            /** New 30D */
            new_30d: number;
            /** New 7D */
            new_7d: number;
            /** Real */
            real: number;
            /** Staff */
            staff: number;
            /** Total */
            total: number;
        };
        /** OverviewActive */
        OverviewActive: {
            /** D1 */
            d1: number;
            /** D30 */
            d30: number;
            /** D7 */
            d7: number;
            /** Real D30 */
            real_d30: number;
            /** Real D7 */
            real_d7: number;
        };
        /** OverviewLogPose */
        OverviewLogPose: {
            /** Questions Month */
            questions_month: number;
            /** Spend Month Usd */
            spend_month_usd: number;
            /** Users With Access */
            users_with_access: number;
        };
        /** OverviewMatches */
        OverviewMatches: {
            /** Avg Turns 30D */
            avg_turns_30d: number | null;
            /** Last 7D */
            last_7d: number;
            /** Ranked 7D */
            ranked_7d: number;
            /** Total */
            total: number;
        };
        /** OverviewPlanner */
        OverviewPlanner: {
            /** Decks */
            decks: number;
            /** Users With Decks */
            users_with_decks: number;
        };
        /** OwnedAddItem */
        OwnedAddItem: {
            /** Add */
            add: number;
            /** Card Id */
            card_id: string;
        };
        /**
         * OwnedAddRequest
         * @description Copies to add on top of what the user already owns (a scanned photo's cards).
         */
        OwnedAddRequest: {
            /** Items */
            items: components["schemas"]["OwnedAddItem"][];
        };
        /** OwnedAddResponse */
        OwnedAddResponse: {
            /** Items */
            items: components["schemas"]["OwnedAddResult"][];
        };
        /** OwnedAddResult */
        OwnedAddResult: {
            /** Card Id */
            card_id: string;
            /** Owned */
            owned: number;
        };
        /** OwnedCardItem */
        OwnedCardItem: {
            /**
             * Alt Arts
             * @default []
             */
            alt_arts: components["schemas"]["PrintingView"][];
            /**
             * Alts Owned
             * @default 0
             */
            alts_owned: number;
            /**
             * Buying
             * @default 0
             */
            buying: number;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /** Display Art */
            display_art?: number | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Low Price */
            low_price?: number | null;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /** Owned */
            owned: number;
            /** Product Id */
            product_id?: number | null;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
            /**
             * Used In
             * @default []
             */
            used_in: string[];
            /** Value */
            value?: number | null;
        };
        /** OwnedCollectionResponse */
        OwnedCollectionResponse: {
            /** Items */
            items: components["schemas"]["OwnedCardItem"][];
            /** Total Copies */
            total_copies: number;
            /** Total Value */
            total_value: number;
            /** Unique Cards */
            unique_cards: number;
            /** Unpriced Cards */
            unpriced_cards: number;
        };
        /** OwnedPrintingResult */
        OwnedPrintingResult: {
            /** Card Id */
            card_id: string;
            /** Product Id */
            product_id: number;
            /** Qty */
            qty: number;
        };
        /**
         * OwnedPrintingUpdate
         * @description Set how many copies of an alt printing the user owns.
         */
        OwnedPrintingUpdate: {
            /** Qty */
            qty: number;
        };
        /** OwnedUpdate */
        OwnedUpdate: {
            /** Qty */
            qty: number;
        };
        /** PersonOut */
        PersonOut: {
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
        };
        /** PlayIn */
        PlayIn: {
            /** Room Id */
            room_id?: string | null;
            /** Server Url */
            server_url?: string | null;
        };
        /** PlayOut */
        PlayOut: {
            /**
             * Action
             * @enum {string}
             */
            action: "join" | "host" | "wait" | "hosted";
            /** Room Id */
            room_id?: string | null;
            /** Server Url */
            server_url?: string | null;
        };
        /** PlayerOut */
        PlayerOut: {
            /** Seed */
            seed: number | null;
            /** Status */
            status: string;
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
        };
        /** PlayerReportIn */
        PlayerReportIn: {
            /** Image Kind */
            image_kind?: ("playmat" | "cardBack") | null;
            /** Image Src */
            image_src?: string | null;
            /** Match Id */
            match_id?: string | null;
            /** Note */
            note?: string | null;
            /**
             * Reason
             * @enum {string}
             */
            reason: "conduct" | "toxic" | "image";
            /** Reported Seat */
            reported_seat?: (0 | 1) | null;
            /** Reported User Id */
            reported_user_id?: number | null;
            /**
             * Source
             * @enum {string}
             */
            source: "match" | "spectate" | "postmatch" | "history" | "friends";
        };
        /** PlayerReportOut */
        PlayerReportOut: {
            /** Duplicate */
            duplicate: boolean;
            /** Id */
            id: number;
        };
        /** PlayerWarningOut */
        PlayerWarningOut: {
            /** Created At */
            created_at: string;
            /** Id */
            id: number;
            /** Message */
            message: string;
        };
        /** PriceAlertCreate */
        PriceAlertCreate: {
            /** Card Id */
            card_id: string;
            /**
             * Direction
             * @default below
             * @enum {string}
             */
            direction: "below" | "above";
            /**
             * Notify App
             * @default true
             */
            notify_app: boolean;
            /**
             * Notify Email
             * @default true
             */
            notify_email: boolean;
            /**
             * Product Id
             * @default 0
             */
            product_id: number;
            /** Target Price */
            target_price: number;
        };
        /** PriceAlertList */
        PriceAlertList: {
            /** Alerts */
            alerts: components["schemas"]["PriceAlertOut"][];
            /** Email Enabled */
            email_enabled: boolean;
        };
        /** PriceAlertOut */
        PriceAlertOut: {
            /** Armed */
            armed: boolean;
            /** Art Name */
            art_name: string;
            /** Card Id */
            card_id: string;
            /** Card Name */
            card_name: string;
            /** Created At */
            created_at?: string | null;
            /** Current Price */
            current_price: number | null;
            /**
             * Direction
             * @enum {string}
             */
            direction: "below" | "above";
            /** Id */
            id: number;
            /** Image Url */
            image_url: string;
            /** Is Alt */
            is_alt: boolean;
            /** Met Now */
            met_now: boolean;
            /** Notify App */
            notify_app: boolean;
            /** Notify Email */
            notify_email: boolean;
            /** Paused */
            paused: boolean;
            /** Product Id */
            product_id: number;
            /** Target Price */
            target_price: number;
            /** Tcgplayer Url */
            tcgplayer_url: string;
            /** Triggered At */
            triggered_at?: string | null;
            /** Triggered Price */
            triggered_price?: number | null;
        };
        /** PriceAlertUpdate */
        PriceAlertUpdate: {
            /** Direction */
            direction?: ("below" | "above") | null;
            /** Notify App */
            notify_app?: boolean | null;
            /** Notify Email */
            notify_email?: boolean | null;
            /** Paused */
            paused?: boolean | null;
            /** Target Price */
            target_price?: number | null;
        };
        /** PriceHistoryImport */
        PriceHistoryImport: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Prices */
            prices: {
                [key: string]: number | null;
            };
        };
        /** PriceHistoryImportResult */
        PriceHistoryImportResult: {
            /** Day */
            day: string;
            /** Stored */
            stored: number;
        };
        /** PriceHistoryResponse */
        PriceHistoryResponse: {
            /** Card Id */
            card_id: string;
            /** Current */
            current?: number | null;
            /**
             * Group Name
             * @default
             */
            group_name: string;
            /** Name */
            name: string;
            /** Points */
            points: [
                string,
                number
            ][];
            /** Product Id */
            product_id: number;
            /** Rarity */
            rarity?: string | null;
            /** Released */
            released?: string | null;
        };
        /** PrintingView */
        PrintingView: {
            /**
             * Collector
             * @default 0
             */
            collector: number;
            /**
             * Group Name
             * @default
             */
            group_name: string;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /**
             * Is Special
             * @default true
             */
            is_special: boolean;
            /** Low Price */
            low_price?: number | null;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /**
             * Owned
             * @default 0
             */
            owned: number;
            /** Product Id */
            product_id: number;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
            /**
             * Wanted
             * @default 0
             */
            wanted: number;
        };
        /** PublicShoppingResponse */
        PublicShoppingResponse: {
            /** Cards Still Needed */
            cards_still_needed: number;
            /**
             * Collector Copies
             * @default 0
             */
            collector_copies: number;
            /** Deck Name */
            deck_name?: string | null;
            /** Items */
            items: components["schemas"]["ShoppingItem"][];
            /**
             * Kind
             * @default shopping
             */
            kind: string;
            /**
             * Owner Name
             * @default
             */
            owner_name: string;
            /** Remaining Market */
            remaining_market: number;
            /** Unique Cards */
            unique_cards: number;
            /**
             * Viewer Is Owner
             * @default false
             */
            viewer_is_owner: boolean;
            /**
             * Viewer Signed In
             * @default false
             */
            viewer_signed_in: boolean;
        };
        /** RecentSale */
        RecentSale: {
            /**
             * Condition
             * @default
             */
            condition: string;
            /**
             * Language
             * @default
             */
            language: string;
            /**
             * Order Date
             * @default
             */
            order_date: string;
            /** Price */
            price: number;
            /**
             * Quantity
             * @default 1
             */
            quantity: number;
            /**
             * Shipping
             * @default 0
             */
            shipping: number;
            /**
             * Variant
             * @default
             */
            variant: string;
        };
        /** RecentSalesResponse */
        RecentSalesResponse: {
            /** Product Id */
            product_id: number;
            /** Sales */
            sales: components["schemas"]["RecentSale"][];
        };
        /** ReportNoteIn */
        ReportNoteIn: {
            /** Note */
            note?: string | null;
        };
        /** ReportPerson */
        ReportPerson: {
            /** Id */
            id: number;
            /** Name */
            name: string;
        };
        /** ReportRow */
        ReportRow: {
            /** Action */
            action: string;
            /** Cosmetic Id */
            cosmetic_id: number | null;
            /** Created At */
            created_at: string;
            /** Handled At */
            handled_at: string | null;
            /** Handled By Name */
            handled_by_name: string | null;
            /** Has Image */
            has_image: boolean;
            /** Id */
            id: number;
            /** Image Kind */
            image_kind: ("playmat" | "cardBack") | null;
            /** Image Taken Down */
            image_taken_down: boolean;
            /** Match Finished */
            match_finished: boolean;
            /** Match Id */
            match_id: string;
            /** Note */
            note: string;
            /**
             * Reason
             * @enum {string}
             */
            reason: "conduct" | "toxic" | "image";
            reported: components["schemas"]["ReportedPlayer"];
            reporter: components["schemas"]["ReportPerson"] | null;
            /** Source */
            source: string;
            /** Staff Note */
            staff_note: string;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "dismissed" | "actioned";
        };
        /** ReportWarnIn */
        ReportWarnIn: {
            /** Message */
            message: string;
        };
        /** ReportedPlayer */
        ReportedPlayer: {
            /** Banned */
            banned: boolean;
            /** Id */
            id: number;
            /** Name */
            name: string;
            /** Open Reports */
            open_reports: number;
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "moderator" | "admin";
            /** Total Reports */
            total_reports: number;
            /** Warnings */
            warnings: number;
        };
        /** RoleIn */
        RoleIn: {
            /** Role */
            role: string;
        };
        /** ScanSampleExportItem */
        ScanSampleExportItem: {
            /** Confidence */
            confidence: string;
            /** Final Id */
            final_id: string;
            /** Id */
            id: number;
            /** Image B64 */
            image_b64: string;
            /** Label */
            label: string;
            /** Predicted Id */
            predicted_id: string | null;
            /** Split */
            split: string;
        };
        /** ScanSampleIn */
        ScanSampleIn: {
            /**
             * Confidence
             * @enum {string}
             */
            confidence: "sure" | "check" | "none";
            /** Final Id */
            final_id: string;
            /** Image */
            image: string;
            /**
             * Label
             * @enum {string}
             */
            label: "confirmed" | "corrected";
            /** Predicted Id */
            predicted_id?: string | null;
        };
        /** ScanSamplesCount */
        ScanSamplesCount: {
            /** Count */
            count: number;
        };
        /** ScanSamplesDeleted */
        ScanSamplesDeleted: {
            /** Deleted */
            deleted: number;
        };
        /** ScanSamplesExport */
        ScanSamplesExport: {
            /** Items */
            items: components["schemas"]["ScanSampleExportItem"][];
            /** Next After Id */
            next_after_id: number;
        };
        /** ScanSamplesIn */
        ScanSamplesIn: {
            /** Items */
            items: components["schemas"]["ScanSampleIn"][];
        };
        /** ScanSamplesSaved */
        ScanSamplesSaved: {
            /** Saved */
            saved: number;
        };
        /** ShareCreate */
        ShareCreate: {
            /** Deck Id */
            deck_id?: number | null;
            /** Deck Ids */
            deck_ids?: number[] | null;
            /** Include Extras */
            include_extras?: boolean | null;
            /**
             * Kind
             * @default shopping
             */
            kind: string;
        };
        /** ShareInfo */
        ShareInfo: {
            /** Deck Id */
            deck_id?: number | null;
            /** Deck Ids */
            deck_ids?: number[] | null;
            /**
             * Include Extras
             * @default true
             */
            include_extras: boolean;
            /** Kind */
            kind: string;
            /** Path */
            path: string;
            /** Token */
            token: string;
        };
        /** SharingIn */
        SharingIn: {
            /** Collection */
            collection?: ("friends" | "off") | null;
            /** Decks */
            decks?: ("friends" | "off") | null;
            /** Show Values */
            show_values?: boolean | null;
            /** Trades Open */
            trades_open?: boolean | null;
        };
        /** SharingOut */
        SharingOut: {
            /**
             * Collection
             * @enum {string}
             */
            collection: "friends" | "off";
            /**
             * Decks
             * @enum {string}
             */
            decks: "friends" | "off";
            /** Prompted */
            prompted: boolean;
            /** Show Values */
            show_values: boolean;
            /** Trades Open */
            trades_open: boolean;
        };
        /**
         * ShoppingExtraUpdate
         * @description Target copies to own for a card added straight to Master Shopping.
         */
        ShoppingExtraUpdate: {
            /** Qty */
            qty: number;
        };
        /** ShoppingItem */
        ShoppingItem: {
            /**
             * Alt Arts
             * @default []
             */
            alt_arts: components["schemas"]["PrintingView"][];
            /**
             * Alts Owned
             * @default 0
             */
            alts_owned: number;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Collector Wants
             * @default []
             */
            collector_wants: components["schemas"]["CollectorLine"][];
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Deck Need
             * @default 0
             */
            deck_need: number;
            /**
             * Deck Sort Key
             * @default
             */
            deck_sort_key: string;
            /** Display Art */
            display_art?: number | null;
            /**
             * Extra Qty
             * @default 0
             */
            extra_qty: number;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /**
             * Leader Count
             * @default 1
             */
            leader_count: number;
            /** Low Price */
            low_price?: number | null;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /** Need */
            need: number;
            /** Need By Leader */
            need_by_leader?: components["schemas"]["LeaderNeed"][];
            /**
             * Need Summed
             * @default false
             */
            need_summed: boolean;
            /** Owned */
            owned: number;
            /** Primary Leader Card Id */
            primary_leader_card_id?: string | null;
            /** Primary Leader Name */
            primary_leader_name?: string | null;
            /** Product Id */
            product_id?: number | null;
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /** Remaining Cost */
            remaining_cost?: number | null;
            /** Still Need */
            still_need: number;
            /**
             * Tcgplayer Url
             * @default
             */
            tcgplayer_url: string;
            /** Used In */
            used_in: string[];
        };
        /** ShoppingResponse */
        ShoppingResponse: {
            /** Cards Still Needed */
            cards_still_needed: number;
            /**
             * Collector Copies
             * @default 0
             */
            collector_copies: number;
            /** Items */
            items: components["schemas"]["ShoppingItem"][];
            /** Remaining Market */
            remaining_market: number;
            /** Unique Cards */
            unique_cards: number;
        };
        /** SignupDay */
        SignupDay: {
            /** Day */
            day: string;
            /** Guests */
            guests: number;
            /** Real */
            real: number;
        };
        /**
         * SignupSource
         * @description First-touch source sent by the client at sign-in (#905).
         *
         *     Every field is optional and cut to its cap (never rejected: a long value
         *     must not fail a sign-in). Control characters are stripped; unknown fields
         *     are ignored.
         */
        SignupSource: {
            /** Land */
            land?: string | null;
            /** Ref */
            ref?: string | null;
            /** Utm Campaign */
            utm_campaign?: string | null;
            /** Utm Medium */
            utm_medium?: string | null;
            /** Utm Source */
            utm_source?: string | null;
        };
        /** SignupSourceOut */
        SignupSourceOut: {
            /** Land */
            land?: string | null;
            /** Ref */
            ref?: string | null;
            /** Utm Campaign */
            utm_campaign?: string | null;
            /** Utm Medium */
            utm_medium?: string | null;
            /** Utm Source */
            utm_source?: string | null;
        };
        /** SimGameDetailOut */
        SimGameDetailOut: {
            /** Combat Log */
            combat_log: string | null;
            /** Has Log */
            has_log: boolean;
            /** Id */
            id: string;
            /** My Deck */
            my_deck: string[];
            /** My Leader */
            my_leader: string | null;
            /** Opp Deck */
            opp_deck: string[];
            /** Opp Leader */
            opp_leader: string | null;
            /** Played At */
            played_at: string | null;
            /** Result */
            result: string;
            /** Source */
            source: string;
            /** Turns */
            turns: number | null;
            /** Went First */
            went_first: boolean | null;
        };
        /** SimGameOut */
        SimGameOut: {
            /** Has Log */
            has_log: boolean;
            /** Id */
            id: string;
            /** My Deck */
            my_deck: string[];
            /** My Leader */
            my_leader: string | null;
            /** Opp Deck */
            opp_deck: string[];
            /** Opp Leader */
            opp_leader: string | null;
            /** Played At */
            played_at: string | null;
            /** Result */
            result: string;
            /** Source */
            source: string;
            /** Turns */
            turns: number | null;
            /** Went First */
            went_first: boolean | null;
        };
        /** SimGamesClearedOut */
        SimGamesClearedOut: {
            /** Deleted */
            deleted: number;
        };
        /**
         * SimGamesImportIn
         * @description Raw OPTCGSim match records (the optcgsim-matches export). Each is validated on its own.
         */
        SimGamesImportIn: {
            /** Games */
            games: {
                [key: string]: unknown;
            }[];
        };
        /** SimGamesImportOut */
        SimGamesImportOut: {
            /** Imported */
            imported: number;
            /** Skipped Duplicates */
            skipped_duplicates: number;
            /** Skipped Invalid */
            skipped_invalid: number;
            /** Total */
            total: number;
        };
        /** SimGamesOut */
        SimGamesOut: {
            /** Games */
            games: components["schemas"]["SimGameOut"][];
            /** Total */
            total: number;
        };
        /** SimMatchupOut */
        SimMatchupOut: {
            /** Games */
            games: number;
            /** Losses */
            losses: number;
            /** My Leader */
            my_leader: string | null;
            /** Opp Leader */
            opp_leader: string | null;
            /** Wins */
            wins: number;
        };
        /** SimMatchupsOut */
        SimMatchupsOut: {
            /** Matchups */
            matchups: components["schemas"]["SimMatchupOut"][];
        };
        /** SpareItem */
        SpareItem: {
            /**
             * Base Owned
             * @default 0
             */
            base_owned: number;
            /** Card Id */
            card_id: string;
            /**
             * Card Type
             * @default
             */
            card_type: string;
            /**
             * Color
             * @default
             */
            color: string;
            /** Cost */
            cost?: number | string | null;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /**
             * Printings
             * @default []
             */
            printings: components["schemas"]["SparePrinting"][];
            /**
             * Rarity
             * @default
             */
            rarity: string;
            /** Spare */
            spare: number;
            /**
             * Want
             * @default 0
             */
            want: number;
        };
        /** SparePrinting */
        SparePrinting: {
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /**
             * Label
             * @default
             */
            label: string;
            /** Owned */
            owned: number;
            /** Product Id */
            product_id: number;
        };
        /** StandingOut */
        StandingOut: {
            /** Losses */
            losses: number;
            /** Played */
            played: number;
            /** Rank */
            rank: number;
            /** User Id */
            user_id: number;
            /** Username */
            username: string;
            /** Wins */
            wins: number;
        };
        /** SummariesOut */
        SummariesOut: {
            /** Tournaments */
            tournaments: components["schemas"]["SummaryOut"][];
        };
        /** SummaryOut */
        SummaryOut: {
            /** Code */
            code: string;
            /** Format */
            format: string;
            /** Id */
            id: number;
            /** My Match Ready */
            my_match_ready: boolean;
            /** My Role */
            my_role: string;
            /** Name */
            name: string;
            /** Players Joined */
            players_joined: number;
            /** Size */
            size: number;
            /** Status */
            status: string;
        };
        /** TakeDownIn */
        TakeDownIn: {
            /** Reason */
            reason: string;
        };
        /** TournamentIn */
        TournamentIn: {
            /**
             * Format
             * @enum {string}
             */
            format: "single_elim" | "round_robin";
            /** Name */
            name: string;
            /** Size */
            size: number;
            /**
             * Timer
             * @default seat_15m
             * @enum {string}
             */
            timer: "off" | "turn_30" | "seat_15m" | "turn_30_seat_15m";
        };
        /** TournamentOut */
        TournamentOut: {
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            /** Finished At */
            finished_at: string | null;
            /** Format */
            format: string;
            /** Id */
            id: number;
            /** Matches */
            matches: components["schemas"]["MatchOut"][];
            me: components["schemas"]["MeOut"];
            /** Name */
            name: string;
            organizer: components["schemas"]["PersonOut"];
            /** Players */
            players: components["schemas"]["PlayerOut"][];
            /** Rounds */
            rounds: number;
            /** Size */
            size: number;
            /** Standings */
            standings: components["schemas"]["StandingOut"][];
            /** Started At */
            started_at: string | null;
            /** Status */
            status: string;
            /** Timer */
            timer: string;
            winner: components["schemas"]["PersonOut"] | null;
        };
        /** TradeIn */
        TradeIn: {
            /** Lines */
            lines: components["schemas"]["TradeLineIn"][];
            /**
             * Message
             * @default
             */
            message: string;
            /** To User Id */
            to_user_id: number;
        };
        /** TradeKeepIn */
        TradeKeepIn: {
            /** Keep Qty */
            keep_qty: number;
        };
        /** TradeKeepOut */
        TradeKeepOut: {
            /** Card Id */
            card_id: string;
            /** Keep Qty */
            keep_qty: number;
            /** Spare */
            spare: number;
        };
        /** TradeLineIn */
        TradeLineIn: {
            /** Card Id */
            card_id: string;
            /** Product Id */
            product_id?: number | null;
            /** Qty */
            qty: number;
            /**
             * Side
             * @enum {string}
             */
            side: "give" | "get";
        };
        /** TradeLineOut */
        TradeLineOut: {
            /** Card Id */
            card_id: string;
            /**
             * Image Url
             * @default
             */
            image_url: string;
            /** Market Price */
            market_price?: number | null;
            /** Name */
            name: string;
            /** Printing Label */
            printing_label?: string | null;
            /** Product Id */
            product_id?: number | null;
            /** Qty */
            qty: number;
            /**
             * Side
             * @enum {string}
             */
            side: "give" | "get";
        };
        /** TradeOut */
        TradeOut: {
            /** Completed At */
            completed_at?: number | null;
            /** Created At */
            created_at: number;
            /** Expires At */
            expires_at: number;
            /** From User Id */
            from_user_id: number;
            /** From Username */
            from_username: string;
            /** Get Value */
            get_value?: number | null;
            /** Give Value */
            give_value?: number | null;
            /** I Am Sender */
            i_am_sender: boolean;
            /** Id */
            id: number;
            /** Lines */
            lines: components["schemas"]["TradeLineOut"][];
            /**
             * Message
             * @default
             */
            message: string;
            /**
             * My Applied
             * @default false
             */
            my_applied: boolean;
            /**
             * Other Applied
             * @default false
             */
            other_applied: boolean;
            /** Parent Offer Id */
            parent_offer_id?: number | null;
            /** Responded At */
            responded_at?: number | null;
            /** Status */
            status: string;
            /** To User Id */
            to_user_id: number;
            /** To Username */
            to_username: string;
        };
        /** TradeSummaryOut */
        TradeSummaryOut: {
            /** Active */
            active: number;
            /** Incoming Pending */
            incoming_pending: number;
        };
        /** TradesOut */
        TradesOut: {
            /** Active */
            active: components["schemas"]["TradeOut"][];
            /** History */
            history: components["schemas"]["TradeOut"][];
            /** Incoming */
            incoming: components["schemas"]["TradeOut"][];
            /** Outgoing */
            outgoing: components["schemas"]["TradeOut"][];
        };
        /** TrafficOut */
        TrafficOut: {
            /** Days */
            days: number;
            /** Render */
            render: {
                [key: string]: unknown;
            };
            /** Vercel */
            vercel: {
                [key: string]: unknown;
            };
        };
        /** UploadOwner */
        UploadOwner: {
            /** Banned */
            banned: boolean;
            /** Id */
            id: number;
            /** Name */
            name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "moderator" | "admin";
        };
        /**
         * UploadRestored
         * @description What a restore answers: the UploadRow plus the two keys the route has always added (in that order).
         */
        UploadRestored: {
            /** Created At */
            created_at: string;
            /** Id */
            id: number;
            /** In Use */
            in_use: boolean;
            /**
             * Kind
             * @enum {string}
             */
            kind: "playmat" | "cardBack";
            /** Mime */
            mime: string;
            owner: components["schemas"]["UploadOwner"];
            /** Report Count */
            report_count: number;
            /** Size */
            size: number;
            /** Taken Down */
            taken_down: boolean;
            /** Taken Down At */
            taken_down_at: string | null;
            /** Taken Down By Name */
            taken_down_by_name: string | null;
            /** Taken Down Reason */
            taken_down_reason: string | null;
            /** User Id */
            user_id: number;
        };
        /** UploadRow */
        UploadRow: {
            /** Created At */
            created_at: string;
            /** Id */
            id: number;
            /** In Use */
            in_use: boolean;
            /**
             * Kind
             * @enum {string}
             */
            kind: "playmat" | "cardBack";
            /** Mime */
            mime: string;
            owner: components["schemas"]["UploadOwner"];
            /** Report Count */
            report_count: number;
            /** Size */
            size: number;
            /** Taken Down At */
            taken_down_at: string | null;
            /** Taken Down By Name */
            taken_down_by_name: string | null;
            /** Taken Down Reason */
            taken_down_reason: string | null;
        };
        /** UploadsPage */
        UploadsPage: {
            /** Items */
            items: components["schemas"]["UploadRow"][];
            /** Total */
            total: number;
        };
        /** UserDuel */
        UserDuel: {
            /** Friend Requests Pending */
            friend_requests_pending: number;
            /** Friends */
            friends: number;
            /** Saved Decks */
            saved_decks: number;
            /** Uploads */
            uploads: number;
            /** Uploads Taken Down */
            uploads_taken_down: number;
        };
        /** UserLogPose */
        UserLogPose: {
            /** Access */
            access: ("pending" | "approved" | "denied") | null;
            /** Last Used At */
            last_used_at: string | null;
            /** Questions Month */
            questions_month: number;
            /** Questions Total */
            questions_total: number;
            /** Spend Month Usd */
            spend_month_usd: number;
            /** Spend Total Usd */
            spend_total_usd: number;
            /** Threads */
            threads: number;
        };
        /** UserModeTally */
        UserModeTally: {
            /** Games */
            games: number;
            /**
             * Mode
             * @enum {string}
             */
            mode: "ranked" | "friends" | "private" | "bot" | "practice";
            /** Wins */
            wins: number;
        };
        /** UserModeration */
        UserModeration: {
            banned_by: components["schemas"]["BannedBy"] | null;
            /** Reports Against */
            reports_against: number;
            /** Reports Filed */
            reports_filed: number;
            /** Reports Open */
            reports_open: number;
            /** Warnings */
            warnings: number;
        };
        /** UserOnline */
        UserOnline: {
            /** Now */
            now: boolean;
            /** Ranked */
            ranked: boolean | null;
            /** Room Role */
            room_role: ("player" | "spectator") | null;
        };
        /** UserOut */
        UserOut: {
            /** Email */
            email: string;
            /** Id */
            id: number;
            /** Name */
            name: string;
            /**
             * Role
             * @default user
             */
            role: string;
            /**
             * Share Scans
             * @default true
             */
            share_scans: boolean;
            /**
             * Sum Across Leaders
             * @default false
             */
            sum_across_leaders: boolean;
            /** Username */
            username?: string | null;
        };
        /** UserPlanner */
        UserPlanner: {
            /** Decks */
            decks: number;
            /** Owned Cards */
            owned_cards: number;
            /** Owned Unique */
            owned_unique: number;
        };
        /** UserPreferencesUpdate */
        UserPreferencesUpdate: {
            /** Share Scans */
            share_scans?: boolean | null;
            /** Sum Across Leaders */
            sum_across_leaders?: boolean | null;
        };
        /** UserRating */
        UserRating: {
            /** Ranked Games */
            ranked_games: number;
            /** Rating */
            rating: number;
        };
        /** UsernameSuggestionOut */
        UsernameSuggestionOut: {
            /** Username */
            username: string;
        };
        /** UsernameUpdate */
        UsernameUpdate: {
            /** Username */
            username: string;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /**
         * FeedbackIn
         * @description A player's problem report, idea or other note, with light context.
         */
        app__admin__schemas__FeedbackIn: {
            /**
             * App
             * @enum {string}
             */
            app: "duel" | "planner";
            /**
             * Client Build
             * @default
             */
            client_build: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "bug" | "idea" | "other";
            /** Message */
            message: string;
            /**
             * Page
             * @default
             */
            page: string;
            /**
             * Room Id
             * @default
             */
            room_id: string;
            /**
             * User Agent
             * @default
             */
            user_agent: string;
            /**
             * Viewport
             * @default
             */
            viewport: string;
        };
        /** FeedbackIn */
        app__routers__analyst_feedback__FeedbackIn: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "chat" | "review";
            /** Match Id */
            match_id?: string | null;
            /** Message Index */
            message_index?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
            /**
             * Rating
             * @enum {string}
             */
            rating: "up" | "down" | "wrong";
            /**
             * Starts With
             * @default
             */
            starts_with: string;
            /** Thread Id */
            thread_id?: number | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    root__get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    bots_admin_bots_get: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminBots"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_cosmetics_admin_cosmetics_get: {
        parameters: {
            query?: {
                state?: "live" | "taken_down" | "all";
                kind?: ("playmat" | "cardBack") | null;
                limit?: number;
                offset?: number;
                before_id?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadsPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cosmetic_image_admin_cosmetics__cosmetic_id__image_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restore_taken_down_cosmetic_admin_cosmetics__cosmetic_id__restore_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadRestored"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    take_down_uploaded_cosmetic_admin_cosmetics__cosmetic_id__take_down_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TakeDownIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_eval_admin_evals_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvalRunIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvalRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_list_events_admin_events_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEventList"];
                };
            };
        };
    };
    admin_create_event_admin_events_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_latest_event_admin_events_latest_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
        };
    };
    admin_event_admin_events__event_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_delete_event_admin_events__event_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEventDeleted"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_update_event_admin_events__event_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_commit_admin_events__event_id__commit_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_draw_admin_events__event_id__draw_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_forfeit_admin_events__event_id__forfeit_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForfeitIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminEvent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_event_csv_admin_events__event_id__participants_csv_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_feedback_admin_feedback_get: {
        parameters: {
            query?: {
                rating?: ("up" | "down" | "wrong") | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminFeedback"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    feedback_export_admin_feedback_export_get: {
        parameters: {
            query?: {
                rating?: "up" | "down" | "wrong";
                days?: number;
                limit?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackExport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hosting_admin_hosting_get: {
        parameters: {
            query?: {
                refresh?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HostingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    matches_on_day_admin_matches_get: {
        parameters: {
            query: {
                day: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminDayMatches"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_me_admin_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminMe"];
                };
            };
        };
    };
    overview_admin_overview_get: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminOverview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reports_admin_reports_get: {
        parameters: {
            query?: {
                status?: "open" | "all";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminReports"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ban_reported_player_admin_reports__report_id__ban_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["BanIn"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_report_admin_reports__report_id__dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ReportNoteIn"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_image_admin_reports__report_id__image_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_reported_image_admin_reports__report_id__remove_image_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ReportNoteIn"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    warn_reported_player_admin_reports__report_id__warn_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportWarnIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_sync_catalog_admin_sync_catalog_post: {
        parameters: {
            query?: never;
            header?: {
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_sync_catalog_status_admin_sync_catalog_status_get: {
        parameters: {
            query?: never;
            header?: {
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    traffic_admin_traffic_get: {
        parameters: {
            query?: {
                days?: number;
                refresh?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrafficOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_admin_users_get: {
        parameters: {
            query?: {
                q?: string;
                include_guests?: number;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUsers"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    user_detail_admin_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUserDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_admin_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ban_user_admin_users__user_id__ban_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["BanIn"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_role_admin_users__user_id__role_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unban_user_admin_users__user_id__unban_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_free_spots_analyst_access_free_spots_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystFreeSpotsIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystFreeSpots"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_access_analyst_access_request_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystAccessRequestIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystAccessRequested"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_requests_analyst_access_requests_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystAccessList"];
                };
            };
        };
    };
    decide_request_analyst_access_requests__user_id__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystAccessDecisionIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystAccessRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    answer_topup_analyst_access_requests__user_id__topup_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystTopupDecisionIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystAccessRow"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_topup_analyst_access_topup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    search_bot_games_route_analyst_bot_games_get: {
        parameters: {
            query?: {
                leader?: string | null;
                opponent?: string | null;
                card?: string | null;
                result?: ("won" | "lost") | null;
                went_first?: boolean | null;
                levels?: string | null;
                min_turns?: number | null;
                max_turns?: number | null;
                limit?: number;
                offset?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BotGameSearchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_bot_games_analyst_bot_games_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BotGamesIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BotBatchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bot_replay_analyst_bot_games__game_id__replay_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path: {
                game_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BotReplayOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_bot_lesson_analyst_bot_lessons_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BotLessonIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BotLessonSavedOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_brief_analyst_briefs_put: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystBriefIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lookup_brief_analyst_briefs_lookup_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystBriefLookupIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystBriefLookupOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    chat_budget_analyst_chat_budget_get: {
        parameters: {
            query?: {
                extra?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystChatBudget"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    chat_credit_analyst_chat_credit_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystChatBudget"];
                };
            };
        };
    };
    chat_session_analyst_chat_session_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystChatSession"];
                };
            };
        };
    };
    list_threads_analyst_chat_threads_get: {
        parameters: {
            query?: {
                scope?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystThreadsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_thread_analyst_chat_threads_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystThreadIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystThreadSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    view_thread_analyst_chat_threads__thread_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystThreadView"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_thread_analyst_chat_threads__thread_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    thread_content_analyst_chat_threads__thread_id__content_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystThreadContent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_drafts_analyst_chat_threads__thread_id__drafts_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystDraftsIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    append_messages_analyst_chat_threads__thread_id__messages_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystAppendIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_proposals_analyst_chat_threads__thread_id__proposals_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                thread_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystProposalsIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_usage_analyst_chat_usage_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystUsageIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    corpus_games_analyst_corpus_games_get: {
        parameters: {
            query?: {
                leader?: string | null;
                opponent?: string | null;
                card?: string | null;
                result?: ("won" | "lost") | null;
                went_first?: boolean | null;
                ranked_only?: boolean;
                days?: number;
                min_turns?: number | null;
                max_turns?: number | null;
                limit?: number;
                offset?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    corpus_replay_analyst_corpus_games__game_id__replay_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path: {
                game_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_decks_analyst_decks_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystDecksOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_feedback_analyst_feedback_get: {
        parameters: {
            query?: {
                thread_id?: number | null;
                match_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackMine"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_feedback_analyst_feedback_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["app__routers__analyst_feedback__FeedbackIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackVote"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    human_bot_games_route_analyst_human_bot_games_get: {
        parameters: {
            query?: {
                after_id?: number;
                limit?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HumanBotGamesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_lessons_analyst_lessons_get: {
        parameters: {
            query?: {
                status?: "draft" | "approved" | "rejected" | "all";
                leader?: string | null;
            };
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystLessonsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    draft_lesson_analyst_lessons_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystLessonIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystLessonOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_lessons_analyst_lessons_review_get: {
        parameters: {
            query?: {
                status?: "draft" | "approved" | "rejected" | "all";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystLessonsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_lesson_analyst_lessons_review__lesson_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_lesson_analyst_lessons_review__lesson_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystLessonReview"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystLessonOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_matches_analyst_matches_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelMatchHistoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_replay_analyst_matches__match_id__replay_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystReplayOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    whoami_analyst_me_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystTokenStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_review_analyst_reviews__match_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystReviewOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_review_analyst_reviews__match_id__put: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
                "x-analyst-token"?: string | null;
            };
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystReviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystReviewOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_model_setting_analyst_settings_model_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystModelSetting"];
                };
            };
        };
    };
    put_model_setting_analyst_settings_model_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystModelIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystModelSetting"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_sharing_analyst_sharing_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystSharing"];
                };
            };
        };
    };
    put_sharing_analyst_sharing_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnalystSharing"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystSharing"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sim_games_analyst_sim_games_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimGamesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    clear_sim_games_analyst_sim_games_delete: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimGamesClearedOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_sim_games_analyst_sim_games_import_post: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimGamesImportIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimGamesImportOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sim_game_matchups_analyst_sim_games_matchups_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimMatchupsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_sim_game_analyst_sim_games__game_id__get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path: {
                game_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimGameDetailOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_sim_game_analyst_sim_games__game_id__delete: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-token"?: string | null;
            };
            path: {
                game_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_matchup_stats_analyst_stats_matchups_get: {
        parameters: {
            query?: {
                leader?: string | null;
                opponent?: string | null;
                days?: number;
                ranked_only?: boolean;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_sim_stats_analyst_stats_sim_get: {
        parameters: {
            query?: {
                leader?: string | null;
                opponent?: string | null;
                levels?: string | null;
                days?: number;
                rules_version?: string | null;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BotSimStatsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    token_status_analyst_token_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystTokenStatus"];
                };
            };
        };
    };
    create_token_analyst_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystTokenCreated"];
                };
            };
        };
    };
    revoke_token_analyst_token_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    analyst_tournament_stats_analyst_tournaments_stats_get: {
        parameters: {
            query?: {
                leader?: string | null;
                opponent?: string | null;
                days?: number;
                min_players?: number;
            };
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyst_tournament_sync_status_analyst_tournaments_sync_status_get: {
        parameters: {
            query?: never;
            header?: {
                "x-analyst-service"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    usage_summary_analyst_usage_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalystUsageSummary"];
                };
            };
        };
    };
    google_callback_auth_callback_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    claim_login_auth_claim_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClaimBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dev_login_auth_dev_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
        };
    };
    google_login_auth_google_get: {
        parameters: {
            query?: {
                return_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    me_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"] | null;
                };
            };
        };
    };
    set_username_auth_me_username_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UsernameUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    username_suggestion_auth_me_username_suggestion_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsernameSuggestionOut"];
                };
            };
        };
    };
    put_collector_want_cards__card_id__collector__product_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
                product_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CollectorWantUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectorWantResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_card_art_spread_cards__card_id__printings_spread_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["CardArtSpreadUpdate"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardArtSpreadResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_card_printing_cards__card_id__printings__product_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
                product_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardPrintingUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardPrintingResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_cards_catalog_cards_get: {
        parameters: {
            query?: {
                q?: string;
                color?: string;
                card_type?: string;
                limit?: number;
                alts?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogCardResult"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_price_history_catalog_cards__card_id__price_history_get: {
        parameters: {
            query?: {
                product_id?: number;
            };
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceHistoryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_card_printings_catalog_cards__card_id__printings_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintingView"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_price_history_catalog_price_history_import_post: {
        parameters: {
            query?: never;
            header?: {
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceHistoryImport"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceHistoryImportResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_recent_sales_catalog_sales__product_id__get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                product_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecentSalesResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_status_catalog_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogStatus"];
                };
            };
        };
    };
    get_decks_decks_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckSummary"][];
                };
            };
        };
    };
    post_deck_decks_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeckCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_deck_decks__deck_id__get: {
        parameters: {
            query?: {
                deck_ids?: number[] | null;
            };
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_deck_decks__deck_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    rename_deck_decks__deck_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeckRename"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_deck_card_decks__deck_id__cards__card_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeckCardUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_deck_card_decks__deck_id__cards__card_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_deck_card_art_spread_decks__deck_id__cards__card_id__printings_spread_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_deck_card_printing_decks__deck_id__cards__card_id__printings__product_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
                card_id: string;
                product_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeckCardPrintingUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_deck_decklist_decks__deck_id__decklist_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeckListReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reset_deck_owned_decks__deck_id__reset_owned_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckOwnedResetResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_deck_main_decks__deck_id__set_main_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_game_server_pool_duel_admin_game_server_pool_get: {
        parameters: {
            query?: never;
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GameServerPoolOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_game_server_pool_duel_admin_game_server_pool_put: {
        parameters: {
            query?: never;
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GameServerPoolIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GameServerPoolOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_card_reports_duel_card_reports_get: {
        parameters: {
            query?: {
                status?: string | null;
                card_id?: string | null;
                limit?: number;
            };
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardReportOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_card_report_duel_card_reports_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardReportIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardReportOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_card_report_duel_card_reports__report_id__patch: {
        parameters: {
            query?: never;
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path: {
                report_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardReportStatusIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardReportOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_cosmetics_duel_cosmetics_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelCosmeticsOut"];
                };
            };
        };
    };
    set_active_cosmetic_duel_cosmetics_active_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelCosmeticActiveIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelCosmeticsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_cosmetic_duel_cosmetics__cosmetic_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelCosmeticsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cosmetic_image_duel_cosmetics__cosmetic_id__image_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    public_cosmetic_image_duel_cosmetics__cosmetic_id__public__sig__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cosmetic_id: number;
                sig: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_cosmetic_duel_cosmetics__kind__post: {
        parameters: {
            query?: {
                activate?: boolean;
            };
            header?: never;
            path: {
                kind: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelCosmeticsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_decks_duel_decks_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelDecksOut"];
                };
            };
        };
    };
    put_decks_duel_decks_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelDeckBulkPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelDecksOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_deck_duel_decks__deck_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deck_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelDeckPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelDeckOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_deck_duel_decks__deck_id__delete: {
        parameters: {
            query: {
                updatedAt: number;
            };
            header?: never;
            path: {
                deck_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelDeckOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mint_dev_token_duel_dev_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelDevTokenIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelTokenOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    current_duel_events_current_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventEnvelope"];
                };
            };
        };
    };
    by_id_duel_events__event_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventEnvelope"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    join_duel_events__event_id__join_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JoinIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventJoined"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mint_guest_token_duel_guest_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelGuestTokenIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelTokenOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    leaderboard_duel_leaderboard_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelLeaderboardOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    live_counts_duel_live_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelLiveOut"];
                };
            };
        };
    };
    ingest_match_duel_matches_post: {
        parameters: {
            query?: never;
            header?: {
                "x-duel-ingest-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelMatchIngest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelMatchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_matches_duel_matches_me_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelMatchHistoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_match_duel_matches_me__match_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelMatchDetailOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_match_replay_duel_matches_me__match_id__replay_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelMatchReplayOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_match_progress_duel_matches__match_id__progress_put: {
        parameters: {
            query?: never;
            header?: {
                "x-duel-ingest-token"?: string | null;
            };
            path: {
                match_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelMatchProgressIngest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_presence_duel_presence_put: {
        parameters: {
            query?: never;
            header?: {
                "x-duel-ingest-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelPresenceSnapshot"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_rating_duel_rating_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelRatingOut"];
                };
            };
        };
    };
    create_player_report_duel_reports_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlayerReportIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayerReportOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_settings_for_me_duel_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelSettingsOut"];
                };
            };
        };
    };
    put_settings_for_me_duel_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelSettingsIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_solo_game_duel_solo_games_post: {
        parameters: {
            query?: never;
            header?: {
                "x-duel-ingest-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DuelSoloGameIngest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mint_token_for_session_duel_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelTokenOut"];
                };
            };
        };
    };
    my_warnings_duel_warnings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayerWarningOut"][];
                };
            };
        };
    };
    ack_warning_duel_warnings__warning_id__ack_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                warning_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_feedback_feedback_get: {
        parameters: {
            query?: {
                status?: string | null;
                limit?: number;
            };
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_feedback_feedback_post: {
        parameters: {
            query?: never;
            header?: {
                authorization?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["app__admin__schemas__FeedbackIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_feedback_feedback__feedback_id__patch: {
        parameters: {
            query?: never;
            header?: {
                "x-ops-token"?: string | null;
                "x-catalog-token"?: string | null;
            };
            path: {
                feedback_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FeedbackStatusIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_friends_friends_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendsOut"];
                };
            };
        };
    };
    dismiss_invite_friends_invites__invite_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invite_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_request_friends_requests_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FriendRequestIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendRequestResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    accept_request_friends_requests__other_id__accept_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                other_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendRequestResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    friend_collection_friends__friend_id__collection_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                friend_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendCollectionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    friend_decks_friends__friend_id__decks_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                friend_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendDeckSummary"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    friend_deck_detail_friends__friend_id__decks__deck_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                friend_id: number;
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendDeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    copy_friend_deck_friends__friend_id__decks__deck_id__copy_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                friend_id: number;
                deck_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    friend_profile_friends__friend_id__profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                friend_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendProfileOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    friend_spares_friends__friend_id__spares_get: {
        parameters: {
            query?: {
                deck_ids?: number[] | null;
            };
            header?: never;
            path: {
                friend_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FriendSparesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_friend_friends__other_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                other_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_friend_friends__other_id__invite_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                other_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FriendInviteIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuelInviteOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_group_buys_group_buys_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuySummary"][];
                };
            };
        };
    };
    post_group_buy_group_buys_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    join_group_buy_group_buys_join__token__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_group_buy_group_buys__group_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_group_buy_group_buys__group_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_group_buy_group_buys__group_id__complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_group_buy_contribution_group_buys__group_id__contribution_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyContributionUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_group_buy_tcgplayer_group_buys__group_id__export_tcgplayer_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyExport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_group_buy_extra_skip_group_buys__group_id__extras__card_id___product_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
                card_id: string;
                product_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyExtraSkipUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    leave_group_buy_group_buys__group_id__leave_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lock_group_buy_group_buys__group_id__lock_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_group_buy_ordered_group_buys__group_id__order_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["GroupBuyOrderUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_group_buy_order_group_buys__group_id__order_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyOrderUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_group_buy_public_group_buys__group_id__public_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyPublicUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sync_group_buy_quantities_group_buys__group_id__quantities_sync_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_group_buy_qty_group_buys__group_id__quantities__card_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyQtyUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_group_buy_qty_group_buys__group_id__quantities__card_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_group_buy_receipt_group_buys__group_id__receipt_apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyReceiptApplyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    match_group_buy_receipt_group_buys__group_id__receipt_match_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyReceiptMatchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyReceiptMatchReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    undo_group_buy_receipt_apply_group_buys__group_id__receipt_undo_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_group_buy_title_group_buys__group_id__title_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupBuyTitleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlock_group_buy_group_buys__group_id__unlock_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_my_sharing_me_sharing_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SharingOut"];
                };
            };
        };
    };
    put_my_sharing_me_sharing_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SharingIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SharingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_spares_me_spares_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MySparesOut"];
                };
            };
        };
    };
    put_trade_keep_me_trade_keep__card_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TradeKeepIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeKeepOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_meta_card_meta_cards__card_id__get: {
        parameters: {
            query?: {
                days?: number;
                min_players?: number;
            };
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetaCardDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_meta_decks_meta_decks_get: {
        parameters: {
            query: {
                leader: string;
                days?: number;
                min_players?: number;
                top?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetaDecks"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_meta_leaders_meta_leaders_get: {
        parameters: {
            query?: {
                days?: number;
                min_players?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetaLeaders"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_notifications_notifications_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_notifications_read_notifications_read_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["NotificationsRead"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_owned_owned_get: {
        parameters: {
            query?: {
                deck_ids?: number[] | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnedCollectionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_owned_add_owned_add_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OwnedAddRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnedAddResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_owned_owned__card_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OwnedUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_display_art_owned__card_id__display_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DisplayArtUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisplayArtResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_owned_printing_owned__card_id__printings__product_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
                product_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OwnedPrintingUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnedPrintingResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_preferences_preferences_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPreferencesUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_price_alerts_price_alerts_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceAlertList"];
                };
            };
        };
    };
    upsert_price_alert_price_alerts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceAlertCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceAlertOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_card_price_alerts_price_alerts_card__card_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceAlertList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_price_alert_price_alerts__alert_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                alert_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_price_alert_price_alerts__alert_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                alert_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceAlertUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceAlertOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    public_group_buy_invite_public_group_buys__token__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyInvitePreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    public_group_buy_view_public_group_buys__token__view_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupBuyDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_public_share_public_share__token__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicShoppingResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_copy_shared_deck_public_share__token__copy_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeckDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_scan_samples_scan_samples_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScanSamplesIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanSamplesSaved"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_scan_samples_scan_samples_export_get: {
        parameters: {
            query?: {
                after_id?: number;
                limit?: number;
            };
            header?: {
                "x-scan-training-token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanSamplesExport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_scan_samples_scan_samples_mine_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanSamplesCount"];
                };
            };
        };
    };
    delete_my_scan_samples_scan_samples_mine_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanSamplesDeleted"];
                };
            };
        };
    };
    post_share_share_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShareCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShareInfo"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_shopping_share_share_shopping_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShareInfo"] | null;
                };
            };
        };
    };
    delete_share_share__token__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_shopping_shopping_get: {
        parameters: {
            query?: {
                deck_ids?: number[] | null;
                extras?: boolean;
                collector?: boolean;
                no_decks?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShoppingResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_shopping_extra_shopping_extras__card_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                card_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShoppingExtraUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_tournaments_tournaments_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SummariesOut"];
                };
            };
        };
    };
    create_tournament_tournaments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TournamentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_tournament_tournaments__code__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_tournaments__code__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_tournaments__code__invite_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InviteIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    join_tournaments__code__join_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    leave_tournaments__code__leave_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    award_tournaments__code__matches__match_id__award_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
                match_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AwardIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    play_tournaments__code__matches__match_id__play_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
                match_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlayIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_player_tournaments__code__players__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_tournaments__code__start_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TournamentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_trades_trades_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradesOut"];
                };
            };
        };
    };
    send_offer_trades_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TradeIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    trade_summary_trades_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeSummaryOut"];
                };
            };
        };
    };
    accept_offer_trades__offer_id__accept_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_offer_trades__offer_id__apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    undo_offer_apply_trades__offer_id__apply_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_offer_trades__offer_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_offer_trades__offer_id__complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    counter_offer_trades__offer_id__counter_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CounterIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decline_offer_trades__offer_id__decline_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offer_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
