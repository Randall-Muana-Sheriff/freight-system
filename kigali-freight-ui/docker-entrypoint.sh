#!/bin/sh
# Runs once at container start, before nginx. Bakes the container's real
# environment into two things the static build can't otherwise see,
# since VITE_API_BASE_URL was fixed into the JS bundle back at `vite
# build` time and can't change without a rebuild:
#   1. /config.js — read by the app at runtime (see src/utils/runtimeConfig.js)
#   2. nginx's CSP connect-src — must allow the real API origin, or the
#      browser silently blocks every fetch/websocket call to it.
set -eu

API_BASE_URL="${API_BASE_URL:-}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = { API_BASE_URL: "${API_BASE_URL}" };
EOF

if [ -n "$API_BASE_URL" ]; then
    # Derive ws(s):// and http(s):// forms of the same origin — fetch()
    # needs the http(s) form, Socket.IO's websocket upgrade needs the
    # ws(s) form, and CSP's connect-src has to allow both explicitly (it
    # doesn't infer one from the other).
    API_ORIGIN=$(echo "$API_BASE_URL" | sed -E 's#^(https?)://([^/]+).*#\1://\2#')
    WS_ORIGIN=$(echo "$API_ORIGIN" | sed -E 's#^http#ws#')
    CONNECT_SRC="$API_ORIGIN $WS_ORIGIN"
else
    echo "WARNING: API_BASE_URL is not set — the app will have no backend to talk to, and CSP connect-src will only allow same-origin requests." >&2
    CONNECT_SRC=""
fi

sed "s#__API_CONNECT_SRC__#${CONNECT_SRC}#" /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
