# Apache ECharts (vendored)

- Version: 5.5.1
- License: Apache 2.0
- Source: https://github.com/apache/echarts
- Bundle: https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js

Self-hosted (rather than CDN-loaded) so the dashboard makes no third-party
network calls and the version is pinned to a known build.

Used by:
- src/views/partials/overview-cards/staleness-trend.ejs (staleness trend chart)
- src/views/pages/overview.ejs (overview charts)

To upgrade: download the new minified bundle to echarts.min.js, update the
version above, then verify the overview charts still render.
