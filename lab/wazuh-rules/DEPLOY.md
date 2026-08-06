# Deploy Custom Rules & IOC Lists — SOC-CORE01

## 1. Copy CDB lists to the manager

```bash
sudo cp malicious-ips.txt /var/ossec/etc/lists/malicious-ips
sudo cp malicious-domains.txt /var/ossec/etc/lists/malicious-domains
sudo cp malicious-hashes.txt /var/ossec/etc/lists/malicious-hashes
sudo chown wazuh:wazuh /var/ossec/etc/lists/malicious-*
```

## 2. Register lists in ossec.conf

Add inside the `<ruleset>` block in `/var/ossec/etc/ossec.conf`:

```xml
<list>etc/lists/malicious-ips</list>
<list>etc/lists/malicious-domains</list>
<list>etc/lists/malicious-hashes</list>
```

## 3. Deploy rules

```bash
# GENERAL BASELINE — real environment, any attack, deploy on every Windows victim always
sudo cp Windows_Security_Baseline_Rules.xml    /var/ossec/etc/rules/     # Windows Security Event Log
sudo cp Sysmon_Baseline_Rules.xml              /var/ossec/etc/rules/     # Sysmon

sudo cp local_rules.xml                        /var/ossec/etc/rules/
sudo cp Windows_Custom_Rules.xml               /var/ossec/etc/rules/     # Challenge A demo (Shadow Gate)
sudo cp Linux_Custom_Rules.xml                 /var/ossec/etc/rules/

# Challenge B demo (Silent Breach) — optional scenario pack on top of the baseline;
# deploy the base + the payload(s) you're using
sudo cp Windows_Homework_Base_Rules.xml        /var/ossec/etc/rules/     # acts 1-6
sudo cp Windows_Homework_Ransomware_Rules.xml  /var/ossec/etc/rules/     # payload B-1
sudo cp Windows_Homework_Mimikatz_Rules.xml    /var/ossec/etc/rules/     # payload B-2
sudo cp Windows_Homework_BloodHound_Rules.xml  /var/ossec/etc/rules/     # payload B-3

sudo chown wazuh:wazuh /var/ossec/etc/rules/*.xml
```

> The general baseline (`Windows_Security_Baseline_Rules.xml` + `Sysmon_Baseline_Rules.xml`) is independent of any
> scenario — it detects real attacker behaviour regardless of which challenge, tool, or live pentest produces it.

> **2026-08-06 fix:** `local_rules.xml` used to embed its own copies of the Linux (100100-100112) and Windows
> (100200-100212) Shadow Gate rules, duplicating IDs already defined in `Linux_Custom_Rules.xml` /
> `Windows_Custom_Rules.xml`. Wazuh rejects a ruleset with the same rule ID defined twice, which is a likely
> cause of "Could not upload rule (1113)" errors. Those duplicate sections were removed — `local_rules.xml` now
> only carries the cross-platform IOC rules (100300-100304). Deploy all three files together, not `local_rules.xml`
> alone. Note `Linux_Custom_Rules.xml` also has its own Linux-specific IOC rules at 100150-100152 — some overlap
> with 100300/100303/100304 is expected (Linux-specific vs. cross-platform); not a conflict since IDs differ.

### 3b. YARA rules (any Windows victim)

```
copy windows_baseline_threats.yar  C:\Tools\YARA\rules\   # general baseline — always deploy
copy silent_breach.yar             C:\Tools\YARA\rules\   # Challenge B demo pack only
# then rebuild index.yar per Config Map §3.2
```

### 3c. CDB known-bad hash for Silent Breach (rule 100411)

Append the EICAR SHA256 to the malicious-hashes list (see `OSSEC_CONF_CHANGES_S6.md` §2):

```
275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f:EICAR-lab-sample
```

## 4. Restart and verify

```bash
sudo /var/ossec/bin/wazuh-control restart
sudo /var/ossec/bin/wazuh-logtest
```

Paste test lines to confirm rules fire. No errors in startup = clean deploy.
For Challenge B single-alert tuning (rule_exclude), follow `OSSEC_CONF_CHANGES_S6.md`.

## Rule ID Map

| ID Range | Category | MITRE Coverage |
|---|---|---|
| 100100–100160 | Linux attacks — Challenge A demo (Shadow Gate), file: `Linux_Custom_Rules.xml` | T1595, T1110.001, T1078, T1190, T1071.001, T1505.003, T1003.008, T1548.001, T1053.003, T1098.004, T1136.001, T1071, T1204 |
| 100200–100230 | Windows attacks — Challenge A demo (Shadow Gate), file: `Windows_Custom_Rules.xml` | T1059, T1105, T1053, T1003, T1070, T1562, T1490, T1486, T1021, T1204, T1547 |
| 100300–100304 | IOC / Threat Intel (cross-platform), file: `local_rules.xml` | T1071, T1110, T1204 |
| 100400–100449 | Windows — Challenge B demo base chain (`Windows_Homework_Base_Rules.xml`) | T1110, T1078, T1105, T1136.001, T1098, T1021.001, T1059.001, T1204.002 |
| 100450–100459 | Windows — Challenge B demo payload B-1 ransomware (`Windows_Homework_Ransomware_Rules.xml`) | T1490, T1486 |
| 100460–100469 | Windows — Challenge B demo payload B-2 mimikatz (`Windows_Homework_Mimikatz_Rules.xml`) | T1003.001 |
| 100470–100479 | Windows — Challenge B demo payload B-3 bloodhound (`Windows_Homework_BloodHound_Rules.xml`) | T1087, T1482, T1074.001 |
| **101000–101049** | **General baseline — Windows Security Event Log** (`Windows_Security_Baseline_Rules.xml`) | T1110, T1110.003, T1078, T1021.001, T1550, T1136.001, T1098, T1531, T1558.003, T1003.006, T1053.005, T1543.003, T1569.002, T1021.002, T1070.001, T1562.002, T1562.004 |
| **101100–101149** | **General baseline — Sysmon** (`Sysmon_Baseline_Rules.xml`) | T1059.001, T1105, T1218, T1140, T1218.005, T1059.005, T1566, T1204.002, T1003.001, T1087, T1482, T1082, T1033, T1021.002/006, T1569.002, T1547.001, T1053.005, T1543.003, T1546.003, T1562.001, T1027, T1574.002, T1071, T1095, T1071.001, T1490, T1486 |

**Deployment model:** the two baseline files (101000+) are **general, always-on** — they detect real
attacker behaviour on any Windows host regardless of scenario. The 100200+ / 100400+ blocks are
**scenario demo packs** layered on top for specific in-class/homework challenges; they can be added
or removed without touching the baseline.
