#!/usr/bin/env bash
# eCIR Session 4 · INE Lab 1 on our lab — SOLVE (instructor, or you AFTER you tried).
# Usage:  sudo bash lab1_solve.sh server   (on SOC01)      — Task 1: receiver on 9997 + firewall + the nc_* indexes
#         sudo bash lab1_solve.sh linux    (on LNX-WEB01)  — Task 3: forward-server + monitor auth.log + restart
# Windows (Task 2) is lab1_solve.ps1. No password is stored here: the Splunk CLI asks for the admin login.
set -e
SOC01=${SOC01:-10.10.10.100}
S=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
UF=${SPLUNKFWD_HOME:-/opt/splunkforwarder}/bin/splunk
case "$1" in
  server)
    "$S" enable listen 9997
    ufw allow 9997/tcp
    for i in nc_wineventlog nc_linux nc_fw nc_web; do "$S" list index 2>/dev/null | grep -qx "$i" || "$S" add index "$i"; done
    echo "[solve] receiver 9997 enabled, firewall open, indexes present." ;;
  linux)
    id splunk >/dev/null 2>&1 || useradd -m splunk
    usermod -aG adm splunk            # auth.log is root:adm
    sudo -u splunk "$UF" add forward-server "$SOC01:9997"
    sudo -u splunk "$UF" add monitor /var/log/auth.log -index nc_linux -sourcetype syslog
    sudo -u splunk "$UF" restart
    logger -p auth.info "eCIR S4 lab1_solve test from $(hostname)"
    echo "[solve] forwarding to $SOC01:9997, monitoring /var/log/auth.log → nc_linux/syslog. A test line was written with logger." ;;
  *) echo "usage: $0 server|linux"; exit 1 ;;
esac
