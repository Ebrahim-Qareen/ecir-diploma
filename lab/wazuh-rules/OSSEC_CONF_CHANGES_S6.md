# ossec.conf changes — Operation Silent Breach (Challenge B)

Goal: **one clean alert per attack action.** Deploy the rules, silence the default
rules that would double-alert, and make sure the agent ships the telemetry the rules need.

Deploy order (same discipline as the CT ruleset):
1. Agent config (WIN-VICTIM01) → restart agent.
2. Upload the 4 rule files to the manager (`/var/ossec/etc/rules/`): `Windows_Homework_Base_Rules.xml`
   (always required) + the payload file(s) you're using (`Windows_Homework_Ransomware_Rules.xml` /
   `Windows_Homework_Mimikatz_Rules.xml` / `Windows_Homework_BloodHound_Rules.xml`).
3. Add the CDB hash + `rule_exclude` lines to the **manager** `ossec.conf`.
4. Restart manager → `wazuh-logtest` smoke test → run the attack → confirm single alerts.

---

## 1. Agent side — WIN-VICTIM01 `ossec.conf`

The rules need: Security channel, Sysmon channel (incl. **EID 10 ProcessAccess** for the
Mimikatz/LSASS rule), and FIM new-file events on TEMP + the sandbox so YARA active-response
scans dropped files. Most of this is already in `04_SOC_Lab/WIN-VICTIM01_ossec.conf`; confirm
these blocks are present:

```xml
<!-- channels -->
<localfile><location>Security</location><log_format>eventchannel</log_format></localfile>
<localfile><location>Microsoft-Windows-Sysmon/Operational</location><log_format>eventchannel</log_format></localfile>
<localfile><location>Microsoft-Windows-PowerShell/Operational</location><log_format>eventchannel</log_format></localfile>
<localfile><location>Application</location><log_format>eventchannel</log_format></localfile>   <!-- synthetic Security events land here -->

<!-- FIM: new files in TEMP + sandbox feed YARA active response -->
<syscheck>
  <alert_new_files>yes</alert_new_files>
  <directories realtime="yes" check_all="yes">C:\Users\socla\AppData\Local\Temp</directories>
  <directories realtime="yes" check_all="yes">C:\Windows\Temp</directories>
  <directories realtime="yes" check_all="yes">C:\SilentBreach-Sandbox</directories>
</syscheck>
```

> **Sysmon EID 10 (LSASS access)** must be enabled in the Sysmon config for rule 100462 to fire.
> The Olaf Hartong config used on WIN-VICTIM01 includes ProcessAccess with an LSASS filter — confirm
> it isn't excluded. If EID 10 is too noisy in your build, rely on 100460 (command line) + 100461
> (synthetic 4656) instead and leave 100462 as the "real tool" rule.

---

## 2. Manager side — CDB known-bad hash (for rule 100411)

The dropped lab samples are EICAR. Add its SHA256 to the malicious-hashes list so the
"known-bad hash written" rule (100411, L15) fires:

```
# /var/ossec/etc/lists/malicious-hashes   (key:value — CDB)
275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f:EICAR-lab-sample
```

Then rebuild the list: `Management → Lists → malicious-hashes → Save`, or on CLI restart the
manager. Confirm `<list>etc/lists/malicious-hashes</list>` is referenced in `ossec.conf` `<ruleset>`.

---

## 3. Manager side — `rule_exclude` (silence default double-alerts)

Wazuh's Sysmon defaults are **level 0** (they don't alert) — no exclusion needed there; our
custom rules provide the alert. The double-alerts come from the default **Windows Security**
rules that also fire on 4624/4720/4732. Add these inside `<ruleset>` in the "Disabled Rules" block:

```xml
    <!-- Silent Breach: our 100400-100479 replace these default win alerts -->
    <rule_exclude>60122</rule_exclude>   <!-- default: successful logon (covered by 100402/100430) -->
    <rule_exclude>60130</rule_exclude>   <!-- default: user account created (covered by 100420) -->
    <rule_exclude>60134</rule_exclude>   <!-- default: member added to security group (covered by 100421) -->
```

> ⚠️ **These default IDs vary by ruleset version.** Do NOT trust the numbers above blindly.
> Find the real ones: run the attack once, open the alert in Discover, read `rule.id` on the
> *default* alert that fired next to ours, and exclude **that** id. This is the first thing the
> Phase-5 test checks. Never `rule_exclude` a whole `0575-win-*` file — that kills base 60009/18152
> our rules chain onto.

Synthetic Security events (acts 1, 3–5) arrive on the **Application** channel, so most default
Security rules (which filter on the Security channel) never match them — for those acts you likely
get a single alert with no exclusion at all. Real 4720/4732 (when `New-LocalUser` succeeds) do hit
the Security channel — that's what the excludes above are for.

---

## 4. "One clean alert" verification (Phase-5 gate)

Run each variant and confirm exactly one custom alert per action:

```
# on WIN-VICTIM01 (Administrator)
.\attack-windows-homework.ps1                     # ransomware
.\attack-windows-homework.ps1 -Payload mimikatz
.\attack-windows-homework.ps1 -Payload bloodhound
```

In Wazuh Discover, filter `rule.groups: silent_breach` and check:

| Action | Expect exactly | Level |
|---|---|---|
| brute-force success | 100402 | 15 |
| malware written | 100410 (+100411 if hash listed) | 12 / 15 |
| user created | 100420 | 12 |
| added to admins | 100421 | 14 |
| RDP logon | 100430 or 100431 | 12 |
| dropper + temp drop | 100440 + 100441 | 13 |
| YARA hit on dropped file | 108001 | 12 |
| ransomware | 100450 + 100451 + 100452 | 15/15/14 |
| mimikatz | 100460 (+100461/100462) | 15 |
| bloodhound | 100470 + 100471 | 14/13 |

✅ Pass = each row shows the expected custom rule and **no duplicate default alert** beside it.
If a default alert appears next to a custom one, note its `rule.id` and add it to the
`rule_exclude` block above.
