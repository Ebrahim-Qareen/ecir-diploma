# Session 07 — Screenshot Checklist

The lecture uses **18 inline SVG diagrams + 3 interactive simulators**, all built from
scratch in the ITGate theme. Nothing is republished from TryHackMe.

Only **real tool screenshots** live in this folder. Three `.shot-todo` placeholders are
wired into `index.html` and are waiting for captures. Everything else on the page is
already complete.

Redact anything sensitive before saving (real names, real domains, lab passwords).

## Wanted captures

| # | Page | Filename | Status | What to capture |
|---|------|----------|--------|-----------------|
| 1 | P12 The report lands | `thehive-phish-alert.png` | ⬜ **todo** | TheHive alert list showing the phishing report ingested from the reporting mailbox — source + severity visible |
| 2 | P13 Read the headers | `mxtoolbox-header-analysis.png` | ⬜ **todo** | MxToolbox Email Header Analyzer with the lab phish headers pasted — hop table + failed SPF/DMARC rows visible |
| 3 | P14 Links & attachments | `urlscan-phish-page.png` | ⬜ **todo** | URLScan.io result for the lab phishing URL — page screenshot + redirect chain |

All three are free public tools you can capture yourself — **no TryHackMe screenshots needed.**

## Optional extras (nice to have, not wired yet)

| Page | Suggested filename | What it would show |
|------|--------------------|--------------------|
| P07 Email headers | `thunderbird-message-source.png` | Thunderbird `Ctrl+U` raw source with the `Received:` chain visible |
| P11 The lab | `wazuh-maillog.png` | Wazuh Discover filtered on `rule.groups:postfix` showing delivery events |
| P14 Attachments | `olevba-output.png` | `olevba` output on the lab macro doc — AutoOpen trigger + suspicious keywords |
| P15 Enrich & verdict | `thehive-observables-phish.png` | TheHive Observables tab with the 8 email IOCs marked "is IOC" + Cortex results |
| P17 Contain | `fortigate-url-block.png` | FortiGate blocklist entry with the phishing domain added |
| P19 Email forensics | `pdfid-output.png` | `pdfid` output flagging `/JavaScript` + `/OpenAction` on the lab PDF |

## Built-in visuals — no capture needed

**Interactive simulators (P09)** — student-driven, nothing auto-plays:

| Simulator | What the student does | What they learn |
|-----------|----------------------|-----------------|
| **SPF check** | Picks *real sender* or *attacker spoofing*, then steps 1→5 | SPF compares the published DNS list against the real TCP source IP — the one thing a sender cannot fake |
| **DKIM check** | Picks *untouched* or *altered in transit*, then steps 1→5 | Signing seals a hash; if the recomputed hash differs, the seal is broken |
| **DMARC decision** | Flips SPF / DKIM / policy switches, verdict updates live | **Alignment** is the point: a message can pass SPF and still fail DMARC |

**Static SVG diagrams (18):** session arc · Cyber Kill Chain · email address anatomy ·
message journey (two DNS lookups) · `Received:` chain (bottom-up) · MIME tree ·
SPF/DKIM/DMARC comparison · phishing targeting spectrum · email log-source map ·
triage decision tree · correlation-rule timeline · containment (14 mailboxes) ·
phishing→malware attack chain · order of volatility · defence in depth · and more.

## THM screenshots — policy

**Do not** republish TryHackMe screenshots on the public site. Where a THM room's visual
would help, either rebuild the concept as our own SVG (which is what all 18 diagrams do),
or capture the equivalent from **our own lab** and credit it as a lab capture.

If a THM figure is genuinely irreplaceable, it may be used **as a credited figure only**
(`source: TryHackMe`) and never as bulk content.

## Placeholder → figure swap

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
