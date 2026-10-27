#!/bin/sh
set -e

# If real Let's Encrypt certificates exist, copy them to /etc/nginx/ssl/
if [ -f /etc/letsencrypt/live/healthcar.me/fullchain.pem ] && [ -f /etc/letsencrypt/live/healthcar.me/privkey.pem ]; then
    echo "🔒 [Nginx] Found Let's Encrypt certificates. Using production SSL."
    cp /etc/letsencrypt/live/healthcar.me/fullchain.pem /etc/nginx/ssl/fullchain.pem
    cp /etc/letsencrypt/live/healthcar.me/privkey.pem /etc/nginx/ssl/privkey.pem
else
    echo "⚠️ [Nginx] Let's Encrypt certs not found on host. Using built-in self-signed SSL."
fi

exec nginx -g "daemon off;"
