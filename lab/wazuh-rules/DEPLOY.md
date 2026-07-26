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
sudo cp local_rules.xml /var/ossec/etc/rules/local_rules.xml
sudo chown wazuh:wazuh /var/ossec/etc/rules/local_rules.xml
```

## 4. Restart and verify

```bash
sudo /var/ossec/bin/wazuh-control restart
sudo /var/ossec/bin/wazuh-logtest
```

Paste test lines to confirm rules fire. No errors in startup = clean deploy.

## Rule ID Map

| ID Range | Category | MITRE Coverage |
|---|---|---|
| 100100–100112 | Linux attacks | T1595, T1110, T1078, T1505, T1003, T1548, T1053, T1098, T1136, T1071, T1190, T1041 |
| 100200–100212 | Windows attacks | T1059, T1105, T1053, T1003, T1070, T1562, T1490, T1486, T1021, T1204, T1547 |
| 100300–100304 | IOC / Threat Intel | T1071, T1110, T1204 |
