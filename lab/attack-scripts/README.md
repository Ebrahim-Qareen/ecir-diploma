# Operation Shadow Gate — Attack Simulation

Two scripts that generate a realistic mixed stream of **normal user activity + a full APT-style kill-chain** across the SOC lab. Students are given the alerts in Wazuh and asked to reconstruct the campaign, pivot to threat-intel platforms with real IOCs, and produce an incident report.

Files:

- `attack-linux.sh` — runs on **LNX-VICTIM01** (Ubuntu, root)
- `attack-windows.ps1` — runs on **WIN-VICTIM01** (Windows 10/11, Administrator PowerShell)
- Detection rules: `docs/lab/wazuh-rules/`
- IOC feeds (CDB lists): `docs/lab/wazuh-ioc-lists/`

---

## 1. Instructor pre-flight

Do this once before class:

1. Deploy the rules and CDB lists on **SOC-CORE01** — see `docs/lab/wazuh-rules/DEPLOY.md`.
2. Refresh the abuse.ch-sourced IOCs so lookups are guaranteed live:
   ```bash
   curl -s https://feodotracker.abuse.ch/downloads/ipblocklist.txt
   curl -s https://urlhaus.abuse.ch/downloads/text_recent/ \
     | grep -oP 'https?://[a-z0-9.-]+\.[a-z]{2,}' | sort -u | head
   ```
   Replace the top block in `malicious-ips.txt` / `malicious-domains.txt` with fresh entries, then restart the manager.
3. Snapshot both victim VMs before running (`pre-shadowgate`) so you can revert after class.
4. Make sure Wazuh is healthy: agents `Active`, dashboard reachable, `wazuh-logtest` clean.

## 1b. Start the exfil receiver (required for Window C on Windows)

The Windows script exfiltrates the stolen SAM/SYSTEM hive to SOC-CORE01 so the
dump is a real artifact the class can examine, not just a log line. Start
this on SOC-CORE01 before running `attack-windows.ps1`:

```bash
python3 exfil-receiver.py
```

Received files land in `./shadowgate-exfil/<timestamp>_WIN-VICTIM01_hives.zip`
on SOC-CORE01. If the receiver isn't running, the script logs a failed exfil
attempt and continues (the PowerShell command line still fires Rule 100221).

## 2. Run the scripts

**LNX-VICTIM01:**
```bash
sudo bash attack-linux.sh
```

**WIN-VICTIM01** (Administrator PowerShell):
```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\attack-windows.ps1
```

Each script writes a timeline log:
- Linux: `/tmp/shadowgate-linux.log`
- Windows: `%TEMP%\shadowgate-windows.log`

Keep those hidden from students until debrief.

## 3. What the scripts do

Every phase is designed to fire specific rules that already exist in `Linux_Custom_Rules.xml` / `Windows_Custom_Rules.xml` / `Threat_Intel_Custom_Rules.xml`. Normal traffic is deliberately interleaved so students cannot just filter by rule level — they must correlate.

### Linux — realistic mixed day (`attack-linux.sh`)

Generates **~1500 nginx access lines** representing a normal business day, with **three separate attack windows** woven in at different times (not one burst). Each window uses a different attacker IP, User-Agent set, URL pattern, and status-code spike, so students must correlate on multiple indicators — time, IP, UA, response code — not just rule level.

| Time | Window | ATT&CK | Behavior | Indicators | Wazuh rule |
|---|---|---|---|---|---|
| 08:00–09:00 | — | — | ~450 normal GETs (mixed IPs/UAs, 200/304/302) | baseline | — |
| **09:15** | **A** | T1595, T1110.001 | Web recon (admin/login/git paths) + 12× SSH brute-force + success | IP `198.51.100.23`, UA `sqlmap`/`Nikto`, 404/403/500 | 100100, 100101, 100102, 100110, 100111 |
| 09:00–11:00 | — | — | ~300 normal lines | baseline | — |
| **13:40** | **B** | T1190, T1505.003, T1105 | Path traversal, web shell drop, malware pull from C2 | IP `203.0.113.50`, UA `curl`/`CobaltStrike`, testmynids + Feodo IP `162.243.103.246`, EICAR | 100103, 100109, 100300, 100302, 100304 |
| 14:00–15:00 | — | — | ~300 normal lines | baseline | — |
| **16:05** | **C** | T1548.001, T1003.008, T1053.003, T1098.004, T1136.001, T1041 | SUID bash, `/etc/shadow` read, cron, SSH key, backdoor user, exfil | exfil IP `192.0.2.100` | 100104–100108, 100112 |
| 16:00–17:00 | — | — | ~150 normal lines | baseline | — |

Student pivots: the three windows share NO indicators — different IPs, UAs, and times. Students must build a timeline and realise it is one campaign across the day, then look each attacker IP / hash / domain up on VirusTotal / AbuseIPDB / URLhaus.

### Windows — realistic mixed day (`attack-windows.ps1`)

Same model as Linux: normal user activity through the day with **three separate attack windows**. Different source IPs, accounts, and techniques per window so students correlate on time + account + IP + process.

| Time | Window | ATT&CK | Behavior | Indicators | Wazuh rule |
|---|---|---|---|---|---|
| 08:00–09:00 | — | — | Normal browsing, services, ~5 interactive logons (Type 2) | baseline | — |
| **09:20** | **A** | T1110, T1078, T1021.001 | 15× failed logon (4625) → success (4624 Type 10) | src `198.51.100.24`, account `administrator` | 100200, 100201, 100202, 100203 |
| **13:30** | **B** | T1053.005, T1547.001, T1059.001, T1105 | Scheduled task + Run key + encoded PS + download cradle pulling "malware" from C2 | testmynids + Feodo IP `162.243.103.246`, EICAR payload | 100210, 100211, 100215, 100216, 100230 |
| **16:10** | **C** | T1003.002, T1041, T1562.001, T1070.001, T1490, T1486 | SAM/SYSTEM export → **exfiltrated to SOC-CORE01** → Defender off, shadow-copy delete, mass encrypt to `.shadowlock`, ransom note | `.shadowlock`, `HOW_TO_DECRYPT.txt`, `hives.zip` on SOC-CORE01 | 100220, 100221, 100222, 100223, 100225, 100226, 100227 |
| 16:30 | — | — | Normal logons + cleanup (Run key, task, sandbox removed) | baseline | — |

Windows scenario flow: **brute-force an account → succeed → persist (task + registry) → pull malware via PowerShell → steal creds → kill recovery → encrypt the PC.** Levels are high (12–14) with critical (15) on the success-after-brute, cred theft, shadow delete, encryption, and known-hash drop.

## 4. IOCs students should pivot on

All of these are safe to look up externally. The first group is guaranteed to flag on public TI platforms; the second group is lab-only and will NOT flag — teaching students to tell "known bad from feed" apart from "unknown, needs investigation."

### External TI hits (VirusTotal / AbuseIPDB / URLhaus / OTX)

| IOC | Type | Where it comes from | Expected result |
|---|---|---|---|
| `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` | SHA256 | EICAR test file | 60+ AV detections on VT |
| `ed01ebfbc9eb5bbea545af4d01bf5f1071661840480439c6e5babe8e080e41aa` | SHA256 | WannaCry dropper | Heavily documented on VT |
| `669fcafcaf217a0ae7776d1c98b6cbb4fd75fb97b12965185136a09c7bfc0ef2` | SHA256 | Cobalt Strike beacon | Malicious on VT / MalwareBazaar |
| `162.243.103.246`, `178.62.3.223` | IP | Feodo Tracker C2 | Malicious on AbuseIPDB / VT / OTX |
| `testmynids.org` | Domain | Emerging Threats IDS test | Well-known safe test callback |
| `always-undetected.com`, `api.recapcha.space` | Domain | URLhaus recent malware | Malicious on VT / URLhaus |

### Lab-only (RFC5737 / .evil.corp — will NOT flag externally)

| IOC | Type | Purpose |
|---|---|---|
| `198.51.100.23`, `198.51.100.24` | IP | Simulated attacker / lateral-movement source |
| `192.0.2.100` | IP | Simulated exfil destination |
| `shadowgate-c2.evil.corp` | Domain | Simulated C2 |

## 5. Student task (hand this out)

You are the Tier-1 SOC analyst on shift. Between **HH:MM and HH:MM** (fill in the actual window), a spike of alerts hit the Wazuh dashboard on `soc-linux-victim01` and `soc-win-victim01`.

Your job:

1. In Wazuh **Threat Hunting**, list every alert in that window and group them by host.
2. Reconstruct the attack timeline for each host (Behavior → Attack → Method → Target → Response → Analysis → Response Action, per your case-writing format).
3. Map every observed step to **MITRE ATT&CK**.
4. Pick the top 5 IOCs (mix of IP, domain, hash) and look each one up on **VirusTotal, AbuseIPDB, URLhaus, and AlienVault OTX**. Screenshot the verdicts.
5. Distinguish IOCs that ARE in threat-intel feeds vs those that are NOT — and explain why "not in TI" does not mean "not malicious."
6. Write an executive summary (5–8 lines): what happened, how bad, what to do next.

## 6. Cleanup (post-class)

Both scripts leave a few artifacts on disk (SSH key on Linux, sandbox files on Windows). Easiest cleanup:

- Revert to `pre-shadowgate` snapshots on both victims, OR
- Manually remove: `/etc/cron.d/system-update`, `/root/.ssh/authorized_keys` (attacker line), `userdel svc_backup`, `/tmp/.bash-suid`, `/tmp/.shadow.dump`, `/var/www/html/shell.php`, `/tmp/staging/`.
- Windows: script already cleans up sandbox, scheduled task, and Run key.

## 7. Safety notes

- **Only run in the isolated lab network.** The Feodo IPs are real routable C2 addresses — connections will fail cleanly (that is enough for the alert), but do not point production egress at them.
- **Never distribute the EICAR file over the internet** — some ISPs will block/quarantine.
- **Do not embed real customer or company data** in the exfil demo. `/etc/passwd` and `/etc/shadow` on a fresh lab VM only contain default accounts + the ones we created.
