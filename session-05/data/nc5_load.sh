#!/bin/bash
# Session 5 — load the recovered JUMP01 log and the alert queue into Splunk (SOC01). Session 4's nc_* data stays as it is.
# Run on the Splunk server as the splunk user. It asks for the Splunk admin login; it stores nothing.
set -e
SPLUNK=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
HERE=$(cd "$(dirname "$0")" && pwd)
read -rp "Splunk admin user: " SU; read -rsp "Splunk admin pass: " SP; echo
for IX in nc5_sysmon nc5_system nc5_alerts; do $SPLUNK add index $IX -auth "$SU:$SP" 2>/dev/null || true; done
# the sourcetype: JSON lines with a "timestamp" field in UTC (copy props.conf.example to $SPLUNK_HOME/etc/system/local/props.conf first)
$SPLUNK add oneshot "$HERE/splunk/jump01_sysmon.json" -index nc5_sysmon -sourcetype nc5_json -host JUMP01 -auth "$SU:$SP"
$SPLUNK add oneshot "$HERE/splunk/jump01_system.json" -index nc5_system -sourcetype nc5_json -host JUMP01 -auth "$SU:$SP"
$SPLUNK add oneshot "$HERE/splunk/nc5_alerts.json" -index nc5_alerts -sourcetype nc5_json -host SOC01 -auth "$SU:$SP"
cp "$HERE"/lookups/nc5_*.csv "${SPLUNK_HOME:-/opt/splunk}/etc/apps/search/lookups/"
echo "Done. Check: index=nc5_* | stats count by index  (expect nc5_sysmon 441 · nc5_system 12 · nc5_alerts 17)"
