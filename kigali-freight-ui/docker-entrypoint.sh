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

# robots.txt and sitemap.xml are written here rather than shipped as static
# files because both need the site's own absolute URL, which is only known
# at deploy time — the same reason config.js is generated above. A sitemap
# listing the wrong host is worse than none at all, since it points a
# crawler at pages that do not exist.
SITE_URL="${SITE_URL:-}"

if [ -n "$SITE_URL" ]; then
    SITE_URL=$(echo "$SITE_URL" | sed 's#/*$##')  # no trailing slash

    cat > /usr/share/nginx/html/robots.txt <<EOF
User-agent: *
Allow: /

# Staff and unattended-display routes. Nothing here is useful in a search
# result, and the sign-in page has no business being indexed.
Disallow: /dispatch
Disallow: /kiosk

Sitemap: ${SITE_URL}/sitemap.xml
EOF

    # Only the three customer-facing routes. /track is included without a
    # code because the empty page is a legitimate landing point — someone
    # searching "track inzira shipment" should be able to arrive there.
    cat > /usr/share/nginx/html/sitemap.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/order</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>
  <url><loc>${SITE_URL}/track</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>
EOF
else
    # Without a known host, refuse to guess. An unrestricted robots.txt is
    # the safe default; a wrong sitemap is not.
    cat > /usr/share/nginx/html/robots.txt <<'EOF'
User-agent: *
Allow: /
Disallow: /dispatch
Disallow: /kiosk
EOF
    echo "WARNING: SITE_URL is not set — sitemap.xml was not generated and robots.txt carries no Sitemap line." >&2
fi

exec nginx -g 'daemon off;'
