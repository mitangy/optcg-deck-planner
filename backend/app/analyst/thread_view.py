"""A stored Log Pose chat thread as the bubbles the panel shows (#400, #726).

Lived in routers/analyst_chat.py; the feedback router renders threads too, so it sits here and
no router imports another (refactor D-02).
"""

from __future__ import annotations

from app.analyst.schemas import AnalystCitation, AnalystDeckDraft, AnalystDeckEdit, AnalystDisplayMessage


# The analyst puts page/deck context in a user text block starting with this; the panel hides it.
CONTEXT_PREFIX = "<context>"


PROPOSE_TOOL = "propose_deck_edit"
NEW_DECK_TOOL = "propose_new_deck"


def tool_ids(content: str | list[dict], tool: str) -> list[str]:
    """The ids of the calls to `tool` in one stored message."""
    if not isinstance(content, list):
        return []
    return [
        b["id"]
        for b in content
        if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == tool and isinstance(b.get("id"), str)
    ]


def _proposal_ids(content: str | list[dict]) -> list[str]:
    """The ids of the propose_deck_edit calls in one stored message."""
    return tool_ids(content, PROPOSE_TOOL)


def _draft_ids(content: str | list[dict]) -> list[str]:
    """The ids of the propose_new_deck calls in one stored message (#726)."""
    return tool_ids(content, NEW_DECK_TOOL)


MAX_CITED_TEXT = 800


def utf16_len(text: str) -> int:
    """Length in UTF-16 code units, the offsets the browser counts text in."""
    return len(text.encode("utf-16-le")) // 2


def _block_citations(block: dict) -> list[dict]:
    """The search-result citations on one text block (other kinds aren't ours), without repeats."""
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for raw in block.get("citations") or []:
        if not isinstance(raw, dict) or raw.get("type") != "search_result_location":
            continue
        source, quote = raw.get("source"), raw.get("cited_text") or ""
        if not isinstance(source, str) or not source or not isinstance(quote, str) or (source, quote) in seen:
            continue
        seen.add((source, quote))
        title = raw.get("title")
        out.append(
            {
                "source": source[:200],
                "title": title[:200] if isinstance(title, str) else "",
                "cited_text": quote if len(quote) <= MAX_CITED_TEXT else quote[: MAX_CITED_TEXT - 1] + "\u2026",
            }
        )
    return out


def _display_text(role: str, content: str | list[dict]) -> tuple[str, list[AnalystCitation]]:
    """What the panel shows for a stored message: its text blocks run together (as they stream), without tool calls,
    tool results or page context, and the citations at the end of the blocks they belong to."""
    if isinstance(content, str):
        return ("" if content.startswith(CONTEXT_PREFIX) else content), []
    text = ""
    cites: list[AnalystCitation] = []
    for b in content:
        if b.get("type") != "text":
            continue
        piece = b.get("text", "")
        if role == "user" and piece.startswith(CONTEXT_PREFIX):
            continue
        text += piece
        if role == "assistant":
            at = utf16_len(text)
            cites += [AnalystCitation(at=at, **c) for c in _block_citations(b)]
    return text, cites


def _attach(out: list[AnalystDisplayMessage], pending: list[AnalystDeckEdit], pending_drafts: list[AnalystDeckDraft]) -> None:
    """Put the deck edits and new decks of a finished turn under the answer that ended it (an answer of its own when there is none)."""
    if not pending and not pending_drafts:
        return
    if out and out[-1].role == "assistant":
        out[-1].proposals += pending
        out[-1].drafts += pending_drafts
    else:
        out.append(AnalystDisplayMessage(role="assistant", text="", proposals=list(pending), drafts=list(pending_drafts)))
    pending.clear()
    pending_drafts.clear()


def thread_view(
    messages: list[tuple[str, str | list[dict]]],
    proposals: dict[str, AnalystDeckEdit] | None = None,
    drafts: dict[str, AnalystDeckDraft] | None = None,
) -> list[AnalystDisplayMessage]:
    """Stored messages as chat bubbles: tool-result-only turns drop out and one answer's pieces join up.

    A deck edit or a new deck goes under the bubble that ends the turn it was made in (#400, #726)."""
    out: list[AnalystDisplayMessage] = []
    pending: list[AnalystDeckEdit] = []
    pending_drafts: list[AnalystDeckDraft] = []
    for role, content in messages:
        if role == "assistant":
            pending += [proposals[i] for i in _proposal_ids(content) if proposals and i in proposals]
            pending_drafts += [drafts[i] for i in _draft_ids(content) if drafts and i in drafts]
        text, cites = _display_text(role, content)
        if not text.strip():
            continue
        if role == "user":
            _attach(out, pending, pending_drafts)
        if out and out[-1].role == role == "assistant":
            base = utf16_len(out[-1].text) + 2
            out[-1].text += "\n\n" + text
            out[-1].citations += [c.model_copy(update={"at": c.at + base}) for c in cites]
        else:
            out.append(AnalystDisplayMessage(role=role, text=text, citations=cites))
    _attach(out, pending, pending_drafts)
    return out
