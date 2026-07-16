#!/usr/bin/env bash
PORT="${1:-8791}"
cd "$(dirname "$0")"
echo "WheelsAndDeals running at http://localhost:$PORT"
python3 -m http.server "$PORT"
