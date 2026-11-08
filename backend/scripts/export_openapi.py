"""Print the API's OpenAPI schema as JSON, without starting a server.

Production keeps /openapi.json switched off (app/main.py), so the schema is built offline:

    cd backend && python scripts/export_openapi.py > openapi.json

tools/ci/openapi-types.cjs runs this and turns the result into the TypeScript types in
packages/api-client/src/generated/schema.ts (refactor 2.1c). Importing the app opens no
database connection, so no environment is needed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402


def main() -> None:
    # sort_keys so the output does not depend on the order routers were included.
    json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
