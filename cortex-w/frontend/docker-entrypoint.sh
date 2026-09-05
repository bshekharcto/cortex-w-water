#!/bin/sh
# Generate /usr/share/nginx/html/runtime-config.js from env vars at
# container start. This is how a single built Docker image moves between
# seed, staging, and production without a rebuild (spec 42).

cat <<JSEOF > /usr/share/nginx/html/runtime-config.js
window.__CORTEX_W_RUNTIME_CONFIG__ = {
  APP_DATA_MODE: '${APP_DATA_MODE:-seed}',
  API_BASE_URL: '${API_BASE_URL:-http://localhost:4000/api}',
  GOOGLE_MAPS_API_KEY: '${GOOGLE_MAPS_API_KEY:-}',
  SHOW_DEMO_AUTH: ${SHOW_DEMO_AUTH:-true},
  ENABLE_HYDRAULIC_SEED: ${ENABLE_HYDRAULIC_SEED:-true},
  METER_FRESHNESS_HOURS: ${METER_FRESHNESS_HOURS:-36},
};
JSEOF

exec "$@"
