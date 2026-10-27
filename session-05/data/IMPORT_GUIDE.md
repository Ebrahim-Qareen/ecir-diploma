# Session 5 data pack — import guide

All data is NovaCart's own (self-authored, seeded). Internal addresses are 10.10.0.0/16; outside addresses are documentation ranges. Times are UTC.

## Kibana (Your lab, pages 9–10)
1. Kibana → Machine Learning → Data Visualizer → **Upload a file** (or the home page's "Upload a file") → choose `kibana/nc5-jump01.ndjson` (362 KB, 453 events).
2. Import → index name `nc5-jump01` → keep "Create data view" ticked → time field `@timestamp`.
3. Repeat for `kibana/nc5-alerts.ndjson` → index `nc5-alerts`.
4. Discover → data view `nc5-jump01` → time range **Oct 7, 2026 01:30 → 03:10** (absolute) → expect **453 hits**.
5. Advanced settings → `dateFormat:tz` = **UTC**, so your times match the page.

## Splunk (Part 2 and the capstone)
Session 4's `nc_*` indexes must already be loaded (Session 4 data pack). Then on SOC01:
`props.conf.example` → `$SPLUNK_HOME/etc/system/local/props.conf`, restart Splunk, run `nc5_load.sh`.
Check: `index=nc5_* | stats count by index` → nc5_sysmon 441 · nc5_system 12 · nc5_alerts 17.
`savedsearches.conf.example` holds the six NovaCart rules as scheduled alerts.

## Lookups
`nc5_intel_feed.csv` — the intel feed the rules had on the night (2 addresses) · `nc5_assets.csv` — asset criticality for severity · `nc5_lab_intel.csv` — our lab intel for enrichment (not real reputation data).
