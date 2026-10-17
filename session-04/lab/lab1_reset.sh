#!/usr/bin/env bash
# eCIR Session 4 · INE Lab 1 on our lab — RESET to INE's starting state (instructor, before class).
# Run as root/sudo.  Usage:  sudo bash lab1_reset.sh server   (on SOC01)
#                            sudo bash lab1_reset.sh linux    (on LNX-WEB01)
# server: receiver on 9997 disabled, firewall closed on 9997, indexes nc_* kept (the night's data stays).
# linux : the Universal Forwarder stays installed and running, but forwards nothing and monitors nothing.
# No password is stored here: the Splunk CLI asks for the admin login when it needs it.
set -e
S=${SPLUNK_HOME:-/opt/splunk}/bin/splunk
UF=${SPLUNKFWD_HOME:-/opt/splunkforwarder}/bin/splunk
case "$1" in
  server)
    "$S" disable listen 9997 || true
    ufw delete allow 9997/tcp 2>/dev/null || true
    echo "[reset] receiver 9997 disabled, firewall closed. Indexes:"; "$S" list index | grep -E '^nc_' || true ;;
  linux)
    for fs in $(sudo -u splunk "$UF" list forward-server 2>/dev/null | grep -Eo '[0-9.]+:[0-9]+'); do sudo -u splunk "$UF" remove forward-server "$fs" || true; done
    sudo -u splunk "$UF" remove monitor /var/log/auth.log 2>/dev/null || true
    sudo -u splunk "$UF" remove monitor /var/log/apache2/access.log 2>/dev/null || true
    sudo -u splunk "$UF" restart
    echo "[reset] UF running, no forward-server, no monitors:"; sudo -u splunk "$UF" list forward-server; sudo -u splunk "$UF" list monitor ;;
  *) echo "usage: $0 server|linux"; exit 1 ;;
esac
