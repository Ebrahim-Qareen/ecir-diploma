#!/usr/bin/env bash
# NovaCart evidence → a real Splunk. Run on the Splunk server (SOC01) as the splunk user, from the folder that holds night/ return/ lookups/.
# Creates the four indexes if needed, then loads every file with its host and sourcetype. Re-running adds duplicates: run nc_clean first.
# Usage:  bash nc_load.sh            (asks for the Splunk admin login — your instructor gives you the account)
#         bash nc_load.sh clean      (deletes the four indexes' data and stops)
set -e
S=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
cd "$(dirname "$0")"
if [ "$1" = clean ]; then for i in nc_wineventlog nc_linux nc_fw nc_web; do "$S" clean eventdata -index $i -f; done; exit 0; fi
for i in nc_wineventlog nc_linux nc_fw nc_web; do "$S" list index 2>/dev/null | grep -qx "$i" || "$S" add index "$i"; done
load() { "$S" add oneshot "$1" -index "$2" -sourcetype "$3" -host "$4" -rename-source "$5"; }
load night/jump01_security.log  nc_wineventlog WinEventLog:Security JUMP01    WinEventLog:Security
load night/lnx-app01_auth.log   nc_linux       syslog               LNX-APP01 /var/log/auth.log
load night/fw01_cef.log         nc_fw          syslog               FW01      udp:514
load return/web01_access.log    nc_web         access_combined      WEB01     /var/log/apache2/access.log
load return/web01_auth.log      nc_linux       syslog               WEB01     /var/log/auth.log
load return/fw01_cef.log        nc_fw          syslog               FW01      udp:514
echo "Loaded. Lookups: Settings > Lookups > Lookup table files > upload lookups/nc_assets.csv and nc_known_bad.csv, then add a lookup definition for each."
echo "Check:  index=nc_* | stats count by index host sourcetype"
