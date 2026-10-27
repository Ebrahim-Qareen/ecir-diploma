#!/usr/bin/env bash
# eCIR Session 6 · Lab B — put night 3's three log files on LNX-WEB01 as evidence.
# Run as your normal user, from the folder where you downloaded file1.log file2.log file3.log SHA256SUMS
# (Session 6 page -> data/labB/). Nothing here needs root or a password.
set -e
cd "$(dirname "$0")"
for f in file1.log file2.log file3.log SHA256SUMS; do
  [ -f "$f" ] || { echo "missing $f - download it from the Session 6 page (data/labB/) into this folder"; exit 1; }
done
echo "== hashes of the downloaded files"
sha256sum -c SHA256SUMS
mkdir -p "$HOME/evidence"
cp file1.log file2.log file3.log SHA256SUMS "$HOME/evidence/"
chmod 444 "$HOME/evidence/"file*.log
cd "$HOME/evidence"
echo "== hashes of the evidence copies"
sha256sum -c SHA256SUMS
echo "Ready: $HOME/evidence (read-only copies). Start with:  cd ~/evidence && head -2 file1.log"
