/**
 * Every planner localStorage key in one place, so collisions and renames are easy to audit.
 * The strings are what users already have stored: never change one without a migration.
 */

// Theme: index.html reads this key in its pre-paint script, keep the two in sync.
export const THEME_STORAGE_KEY = "optcg_theme";

// Card list controls shared by Shopping, deck and group-buy pages.
export const CARD_SORTS_KEY = "optcg_card_sorts";
export const FILTERS_OPEN_KEY = "optcg_filters_open";
// v2: the old key holds "0" for nearly everyone (it was written on every visit),
// so reading it would keep alt arts hidden. A missing v2 value means ON.
export const SHOW_ALT_ARTS_KEY = "optcg_show_alt_arts_v2";
export const OWNED_SORTS_KEY = "optcg_owned_sorts";
export const CARD_LAYOUT_KEY = "optcg_card_layout";

// Shopping
export const SHOPPING_DECKS_KEY = "optcg_shopping_deck_ids";
export const SHOPPING_SELECTED_KEY = "optcg_shopping_selected_cards";
export const SHOW_SHOPPING_DONS_KEY = "optcg_show_shopping_dons";
export const SHOPPING_EXTRAS_KEY = "optcg_shopping_include_extras";
/** Master Shopping "Extra copies" checkbox (#1184). */
export const SHOPPING_COLLECTOR_KEY = "optcg_shopping_show_collector";
export const SHOPPING_ONLY_NEED_KEY = "optcg_shopping_only_need";
export const SHOPPING_ADD_OPEN_KEY = "optcg_shopping_add_open";

// Collection
export const COLLECTION_SHOW_DONS_KEY = "optcg_collection_show_dons";
export const COLLECTION_SPARES_KEY = "optcg_collection_spares_only";
export const COLLECTION_COLORS_KEY = "optcg_collection_colors";
export const COLLECTION_TYPE_KEY = "optcg_collection_type";
export const COLLECTION_ADD_OPEN_KEY = "optcg_collection_add_open";

// Decks
export const DECK_ONLY_NEED_KEY = "optcg_deck_only_need";
export const DECK_DON_AVAILABLE_OPEN_KEY = "optcg_deck_don_available_open";
export const DECK_EDITOR_COLOR_KEY = "optcg_deck_editor_color";
export const DECK_EDITOR_TYPE_KEY = "optcg_deck_editor_card_type";
export const DECK_SEARCH_OPEN_KEY = "optcg_deck_search_open";
export const DECK_PROGRESS_MODE_KEY = "optcg_deck_progress_mode";
export const DECK_STATS_COLLAPSED_KEY = "optcg_deck_stats_collapsed";

// Public share page, price alerts
export const SHARE_ONLY_NEED_KEY = "optcg_share_only_need";
export const ALERTS_ADD_OPEN_KEY = "optcg_alerts_add_open";

// Group buys
export const SETTLEMENT_OPEN_KEY = "optcg_group_buy_settlement_open";
export const MEMBERS_OPEN_KEY = "optcg_group_buy_members_open";

// Column header sorts, one per table (see columnSort.tsx).
export const COLSORT_GB_CARDS_KEY = "optcg_colsort_gb_cards";
export const COLSORT_GB_OWE_KEY = "optcg_colsort_gb_owe";
export const COLSORT_GB_PUBLIC_KEY = "optcg_colsort_gb_public";
export const COLSORT_RECEIPT_KEY = "optcg_colsort_receipt";
export const COLSORT_SHOPPING_KEY = "optcg_colsort_shopping";
export const COLSORT_SHARE_KEY = "optcg_colsort_share";
export const COLSORT_COLLECTION_KEY = "optcg_colsort_collection";
export const COLSORT_DECK_KEY = "optcg_colsort_deck";
