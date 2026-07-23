#!/usr/bin/env bash
# serve.sh - local dev server for LifeSync Tracker
# ------------------------------------------------
# Serves the project files on http://localhost:<port> so you can iterate on
# UI changes locally without committing / pushing to GitHub.
#
# Usage:
#   ./serve.sh                 # port 8000 + auto-open the browser
#   ./serve.sh 8080            # custom port
#   ./serve.sh --no-open       # don't auto-launch the browser
#   ./serve.sh 8080 --no-open  # custom port, no browser
#   ./serve.sh --help          # show this message
#
# Requirements (any one of):
#   python3  (default on modern macOS / Linux)
#   python   (older macOS)
#   npx      (Node.js; uses `npx --yes http-server`)
#   php      (uses the built-in dev server)
#
# Tips during development:
#   - Hard-refresh after editing JS/CSS: Cmd+Shift+R (mac) / Ctrl+F5 (win).
#   - DevTools > Network > "Disable cache" while DevTools is open.
#   - Reset data: DevTools > Application > Local Storage > delete `lifesync_data`.

set -euo pipefail

PORT=8000
OPEN_BROWSER=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-open)  OPEN_BROWSER=false ;;
        --help|-h)
            sed -n '2,20p' "$0"
            exit 0
            ;;
        --port=*)
            tmp="${1#*=}"
            if [[ -n "$tmp" && "$tmp" =~ ^[0-9]+$ ]]; then
                PORT="$tmp"
            else
                echo "Invalid --port value: $1" >&2
                exit 1
            fi
            ;;
        *)
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                PORT="$1"
            else
                echo "Unknown argument: $1 (try --help)" >&2
                exit 1
            fi
            ;;
    esac
    shift
done

cd "$(dirname "$0")"
URL="http://localhost:${PORT}"

# Wait until the server is actually accepting connections on the local port,
# up to ~5 seconds. Avoids the browser hitting 'connection refused' on slow
# first-launch systems where the 0.6 s sleep heuristic would race.
wait_for_port() {
    local i
    for i in $(seq 1 50); do
        if (exec 3<> /dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
            exec 3<&- 3>&-
            return 0
        fi
        sleep 0.1
    done
    return 1
}

open_url() {
    if wait_for_port; then
        if   command -v open     >/dev/null; then open "$URL"
        elif command -v xdg-open >/dev/null; then xdg-open "$URL"
        elif command -v wslview  >/dev/null; then wslview  "$URL"
        else echo "[serve.sh] please open $URL in your browser."
        fi
    else
        echo "[serve.sh] server didn't bind in time; please open $URL manually." >&2
    fi
}

banner() {
    echo "[serve.sh] serving $(pwd) at $URL"
    echo "[serve.sh] ctrl-c to stop"
}

if [[ "$OPEN_BROWSER" == true ]]; then open_url & fi

if   command -v python3 >/dev/null; then banner; exec python3 -m http.server "$PORT"
elif command -v python  >/dev/null; then banner; exec python  -m SimpleHTTPServer "$PORT"
elif command -v npx     >/dev/null; then banner; exec npx --yes http-server -p "$PORT" -c-1
elif command -v php     >/dev/null; then banner; exec php -S "localhost:${PORT}"
else
    echo "[serve.sh] no usable HTTP server found." >&2
    echo "            install python3, node (for npx), or php and try again." >&2
    exit 1
fi
