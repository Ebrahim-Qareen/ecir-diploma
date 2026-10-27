#!/bin/bash
# Session 5 — Your lab check (pages 9–10). Run on SOC01 (or anywhere that reaches the lab ELK).
# The class ELK runs with security off, so no login is needed. Change ES / KB if your lab uses other addresses.
ES=${ES:-http://localhost:9200}
KB=${KB:-http://localhost:5601}
ok(){ echo "  [ok] $1"; } ; no(){ echo "  [--] $1  → $2"; }
echo "Session 5 lab check — $ES · $KB"
N=$(curl -s "$ES/nc5-jump01/_count" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')
[ "$N" = "453" ] && ok "index nc5-jump01 has $N documents" || no "index nc5-jump01: '${N:-missing}' documents (expect 453)" "Upload a file again, index name nc5-jump01"
A=$(curl -s "$ES/nc5-alerts/_count" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')
[ "$A" = "17" ] && ok "index nc5-alerts has $A documents" || no "index nc5-alerts: '${A:-missing}' (expect 17)" "Part 3 needs it — upload nc5-alerts.ndjson"
DV=$(curl -s "$KB/api/data_views" -H 'kbn-xsrf: s5' | grep -o '"title":"nc5-jump01"' | head -1)
[ -n "$DV" ] && ok "data view nc5-jump01 exists" || no "no data view nc5-jump01" "Stack Management → Data views → Create"
S=$(curl -s "$KB/api/saved_objects/_find?type=search&per_page=100" -H 'kbn-xsrf: s5' | grep -o '"title":"H[1-9][^"]*"' | sort -u | wc -l)
[ "$S" -ge 9 ] && ok "$S saved searches named H1…H9" || no "$S saved searches named H1…H9" "save each hunt as H1 …, H2 …"
