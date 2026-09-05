// Default/dev values. In the built Docker image this file is regenerated at
// container start (see frontend/Dockerfile + docker-entrypoint.sh) from the
// container's environment variables, so the same compiled JS bundle can run
// against seed, staging, or production without a rebuild.
window.__CORTEX_W_RUNTIME_CONFIG__ = {
  APP_DATA_MODE: 'seed', // 'seed' | 'api' | 'hybrid'
  API_BASE_URL: 'http://localhost:4000/api',
  GOOGLE_MAPS_API_KEY: 'AIzaSyDPTspFcq0ZZ_Nbjg7HkSQ1toulXqW2XdQ',
  SHOW_DEMO_AUTH: true,
  ENABLE_HYDRAULIC_SEED: true,
  METER_FRESHNESS_HOURS: 36,
};
