# eCIR Diploma — ITGate Academy

![Status](https://img.shields.io/badge/status-delivered-16A34A?style=flat-square)
![Sessions](https://img.shields.io/badge/sessions-10%20%C3%97%204h-2563EB?style=flat-square)
![Stack](https://img.shields.io/badge/stack-HTML%20%C2%B7%20Wazuh-1F2937?style=flat-square)
![License](https://img.shields.io/badge/material-%C2%A9%20ITGate%20Academy-6B7280?style=flat-square)

Practical SOC / DFIR course built for the INE **eCIR** (Enterprise Cyber Incident Response) exam. Ten four-hour instructor-led sessions, a working SOC lab, and investigation challenges with real datasets. Static HTML — no build step, no dependencies, runs offline in a classroom.

**Live site →** https://ebrahim-qareen.github.io/ecir-diploma/

## What students get

- **Ten lecture pages** — paged, with break timer, in-page quizzes and homework
- **A SOC lab** — Wazuh-based, with a setup guide students reproduce on their own machines
- **Investigation challenges** — alert-driven cases with datasets; each ends in a written incident report
- **Cheat sheets and resource hubs** — Windows event IDs, Sysmon, KQL/SPL, MITRE ATT&CK, IR templates

## Course arc

| Block | Sessions | Focus |
|---|---|---|
| Foundations | 1–2 | IR lifecycle (NIST), SOC roles, lab build, log sources |
| Detection | 3–5 | SIEM analysis, Windows/Linux telemetry, network traffic, ATT&CK mapping |
| Investigation | 6–8 | Endpoint and memory triage, malware behaviour, lateral movement, persistence |
| Response | 9–10 | Containment, eradication, recovery, reporting, capstone investigation |

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | Course dashboard (10 sessions) |
| `session-01/ … session-10/` | Full lecture pages |
| `lab/` | SOC lab overview, setup guide, investigation challenges and datasets |
| `cheatsheets/`, `resources/` | Reference hubs |
| `assets/` | CSS, JS, images, SVGs |

`.nojekyll` is included so files serve as-is.

## Running locally

```bash
python3 -m http.server 8000
```

## Security note

The private lab build log with real credentials is **not** in this repository and must never be committed. Datasets contain no real personal data; every scenario is purpose-built.

## Credits and licence

Course material © ITGate Academy. Primary reference: INE eCIR v2. TryHackMe content is linked, not republished.

Maintainer: Ebrahim Mohamed — [LinkedIn](https://linkedin.com/in/EbrahimMohamed)
