#!/bin/bash
# Double-click in Finder to run Gaze Decoder on this Mac.
# It serves this folder at http://localhost (so the browser can ask for the microphone),
# opens the page, and keeps running until you close this window or press Ctrl+C.
cd "$(dirname "$0")" || exit 1
PORT=8765
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
URL="http://localhost:$PORT/"
echo "Gaze Decoder is running at $URL"
echo "Close this window or press Ctrl+C to stop it."
(sleep 1 && open "$URL") &
# HTTP/1.1 keeps connections open; the default HTTP/1.0 server drops some of the app's many module requests.
PROTO=""
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' && PROTO="--protocol HTTP/1.1"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 $PROTO
