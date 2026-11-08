"""Import layering (refactor 3.9b, D-02): routers sit on top, nothing imports a router.

A router module is a file under app/routers or any module that builds an APIRouter. Shared
helpers belong in services, app/core, app/analyst, app/duel, app/social or app/planner, so a
route module never has to reach into a sibling (which is how `_private` imports and
function-local cycle breakers crept in).
"""

from __future__ import annotations

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
# The app factory wires every router in; that is its job.
WIRING = {"app.main"}


def _dotted(path: Path) -> str:
    parts = list(path.relative_to(APP.parent).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _builds_router(tree: ast.Module) -> bool:
    return any(
        isinstance(n, ast.Call) and getattr(n.func, "id", getattr(n.func, "attr", None)) == "APIRouter"
        for n in ast.walk(tree)
    )


def _modules() -> dict[str, ast.Module]:
    return {_dotted(p): ast.parse(p.read_text()) for p in sorted(APP.rglob("*.py"))}


def _router_modules(mods: dict[str, ast.Module]) -> set[str]:
    return {
        name
        for name, tree in mods.items()
        if name.startswith("app.routers.") or _builds_router(tree)
    }


def _imported(name: str, tree: ast.Module) -> set[str]:
    """Every module an import in this file could name, function-local imports included."""
    package = name.rsplit(".", 1)[0] if "." in name else name
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                anchor = package.split(".")[: len(package.split(".")) - (node.level - 1)]
                base = ".".join([*anchor, base] if base else anchor)
            out.add(base)
            out.update(f"{base}.{a.name}" for a in node.names)
    return out


def test_walker_finds_the_router_modules_refactor_3_9b():
    routers = _router_modules(_modules())
    assert {"app.routers.api", "app.routers.duel", "app.social.friends_router"} <= routers
    assert "app.planner.decks" not in routers and "app.main" not in routers


def test_a_router_module_never_imports_another_router_module_refactor_3_9b():
    mods = _modules()
    routers = _router_modules(mods)
    bad = sorted(
        f"{name} imports {target}"
        for name in routers
        for target in _imported(name, mods[name]) & routers
        if target != name and target != "app.routers"
    )
    assert bad == [], "move the shared helper out of the router into a non-router module:\n" + "\n".join(bad)


def test_no_non_router_module_imports_from_app_routers_refactor_3_9b():
    mods = _modules()
    routers = _router_modules(mods)
    bad = sorted(
        f"{name} imports {target}"
        for name, tree in mods.items()
        if name not in routers and name not in WIRING
        for target in _imported(name, tree)
        if target in routers or target == "app.routers" or target.startswith("app.routers.")
    )
    assert bad == [], "services and helpers must not depend on routers:\n" + "\n".join(bad)
