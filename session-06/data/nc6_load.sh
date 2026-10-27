#!/usr/bin/env bash
# NovaCart night 3 (Session 6) -> a real Splunk. Run on the Splunk server (SOC01) as the splunk user, from the folder that holds night3/ labB/ lookups/.
# Creates the four nc6_* indexes if needed and loads every file with its host, source and sourcetype.
# Put props.conf.example into $SPLUNK_HOME/etc/system/local/props.conf first (the Zeek files need it), then restart Splunk once.
# Usage:  bash nc6_load.sh           (asks for the Splunk admin login - your instructor gives you the account)
#         bash nc6_load.sh clean     (stops Splunk, deletes the nc6_* data, starts it again)
set -e
S=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
cd "$(dirname "$0")"
IDX="nc6_linux nc6_fw nc6_web nc6_zeek"
if [ "$1" = clean ]; then "$S" stop; for i in $IDX; do "$S" clean eventdata -index $i -f; done; "$S" start; exit 0; fi
for i in $IDX; do "$S" list index 2>/dev/null | grep -qx "$i" || "$S" add index "$i"; done
load() { "$S" add oneshot "$1" -index "$2" -sourcetype "$3" -host "$4" -rename-source "$5"; }
load night3/lnx-db01_auth.log nc6_linux syslog          LNX-DB01     /var/log/auth.log
load night3/web01_auth.log    nc6_linux syslog          WEB01        /var/log/auth.log
load night3/fw01_cef.log      nc6_fw    syslog          FW01         udp:514
load labB/file1.log           nc6_web   access_combined WEB01        /var/log/apache2/access.log
load labB/file2.log           nc6_zeek  zeek_tsv        SENSOR-DMZ01 /opt/zeek/logs/ssh.log
load labB/file3.log           nc6_zeek  zeek_tsv        SENSOR-DMZ01 /opt/zeek/logs/ftp.log
echo "Loaded. Lookups: Settings > Lookups > Lookup table files > upload lookups/nc6_assets.csv and nc6_known_bad.csv, then add a lookup definition for each."
echo "Check:  index=nc6_* | stats count by index host sourcetype"
