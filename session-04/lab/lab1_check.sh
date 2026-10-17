#!/usr/bin/env bash
# eCIR Session 4 · INE Lab 1 on our lab — CHECK the five Verify items of page 13 (everyone, any time).
# Run on SOC01 as the splunk user (or with sudo -u splunk):  bash lab1_check.sh
# It asks for the Splunk admin login once (your instructor gives you the account) — nothing is stored.
S=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
WIN=${WIN_HOST:-WIN-DC01}; LNX=${LNX_HOST:-lnx-web01}
read -rp "Splunk admin user: " U; read -rsp "Splunk admin secret (not echoed): " P; echo
q() { "$S" search "$1" -auth "$U:$P" -output csv -maxout 50 2>/dev/null | tail -n +2; }
ok=0; bad=0
chk() { if [ "$2" = pass ]; then echo "  ✓ $1"; ok=$((ok+1)); else echo "  ✗ $1"; echo "      fix: $3"; bad=$((bad+1)); fi; }
echo "[check 1] receiver 9997"
"$S" display listen -auth "$U:$P" 2>/dev/null | grep -q 9997 && r=pass || r=fail
chk "port 9997 enabled" $r "Settings → Forwarding and receiving → Receive data → + Add new → 9997; sudo ufw allow 9997/tcp"
echo "[check 2] Windows Security events from $WIN"
n=$(q "search index=* host=$WIN sourcetype=WinEventLog:Security earliest=0 | stats count" | tr -d '"'); [ "${n:-0}" -gt 0 ] && r=pass || r=fail
chk "$WIN: $n Security events" $r "UF running? outputs.conf → SOC01:9997? Security Logs ticked? firewall? index exists?"
f=$(q "search index=* host=$WIN sourcetype=WinEventLog:Security EventCode=4624 earliest=0 | head 1 | table Account_Name" | tr -d '"'); [ -n "$f" ] && r=pass || r=fail
chk "Account_Name is a field on 4624" $r "renderXml = false in inputs.conf; the Windows add-on on the search head"
echo "[check 3] auth.log from $LNX"
n=$(q "search index=* host=$LNX source=/var/log/auth.log earliest=0 | stats count" | tr -d '"'); [ "${n:-0}" -gt 0 ] && r=pass || r=fail
chk "$LNX: $n auth.log lines" $r "splunk add forward-server SOC01:9997; add monitor /var/log/auth.log; usermod -aG adm splunk; restart"
st=$(q "search index=* host=$LNX source=/var/log/auth.log earliest=0 | stats count by sourcetype" | head -1); echo "      sourcetype: ${st:-?}  ← write this down"
echo "[check 4] a fresh logger line (write one on $LNX now: logger -p auth.info \"eCIR S4 test\")"
n=$(q "search index=* host=$LNX \"eCIR S4\" earliest=-60m | stats count" | tr -d '"'); [ "${n:-0}" -gt 0 ] && r=pass || r=fail
chk "test line found in the last 60 min" $r "wait 60 s, then re-run; check the UF: splunk list monitor"
echo "[check 5] hosts"
q "search index=* earliest=0 | stats count by host" | tr -d '"' | sed 's/^/      /'
echo; echo "passed $ok · failed $bad"; [ $bad -eq 0 ] && echo "All green — Verify box ticked." || exit 1
