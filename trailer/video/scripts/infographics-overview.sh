#!/usr/bin/env bash
# Contact sheet of every portrait infographic: ../out/infographics/overview.png
set -euo pipefail
cd "$(dirname "$0")/../../out/infographics"
ls *-portrait.png >/dev/null
ffmpeg -y -loglevel error -pattern_type glob -i '*-portrait.png' \
  -vf "scale=540:-1,tile=4x2:padding=28:margin=28:color=0x0b1630" -frames:v 1 overview.png
echo "wrote out/infographics/overview.png"
