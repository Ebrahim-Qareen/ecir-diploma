# Session 06 — Screenshot Checklist

The lecture uses inline SVG diagrams (self-contained, on-theme). Only **real tool
screenshots** live here. Four are already captured and wired into the page; the rest
are optional — capture them from the live lab and drop them in this folder, then swap
the matching `.shot-todo` placeholder in `index.html` for a `<figure>` + `<img>`.

Redact anything sensitive before saving.

| # | Page | Filename | Status | What to capture |
|---|------|----------|--------|-----------------|
| 1 | P11 Alert lands | `thehive-alert-list.png` | ✅ wired | TheHive alert list with the Wazuh malware alerts |
| 2 | P12 Triage & case | `thehive-assign-createcase.png` | ✅ wired | Alert selected with Assign + Create Case actions |
| 3 | P13 Log IOCs | `thehive-observables.png` | ⬜ todo | Observables tab with IOCs marked "is IOC" (+ Cortex result) |
| 4 | P14 Investigate | `wazuh-yara-tree.png` | ⬜ todo | Wazuh Discover: rule 108001 + Sysmon EID 1/3/13 for WIN-VICTIM01 |
| 5 | P14 Investigate | `wazuh-fortigate-logs.png` | ✅ wired | Wazuh Discover, `rule.groups: fortigate`, src→dst IPs |
| 6 | P16 Contain | `edr-isolate.png` | ✅ wired | LimaCharlie sensor Overview → Isolate From Network |
| 7 | P16 Contain | `fortigate-blocklist.png` | ⬜ todo | FortiGate SOC_BLOCKLIST entry with the C2 IP added |
| 8 | P17 Eradicate/DF | `volatility-netscan.png` | ⬜ todo | Volatility windows.netscan / malfind from the RAM dump |
| 9 | P18 Recover | `snapshot-revert.png` | ⬜ todo | VMware snapshot manager reverting to CLEAN-BASE |

## Placeholder → figure swap (example)

Replace:

```html
<figure class="fig">
  <div class="shot-todo">📷 Screenshot slot — <b>...</b> ...</div>
</figure>
```

with:

```html
<figure class="fig">
  <img src="images/NAME.png" alt="describe what is shown" loading="lazy">
  <figcaption>One line explaining the evidence (source: lab capture).</figcaption>
</figure>
```
