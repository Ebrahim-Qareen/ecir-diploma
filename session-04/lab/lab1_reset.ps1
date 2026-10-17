# eCIR Session 4 · INE Lab 1 on our lab — RESET WIN-DC01 to INE's starting state (instructor, before class).
# Run in an elevated PowerShell. Leaves the Universal Forwarder installed and running, but with no outputs and no inputs
# (INE's Task 2 is then done through the installer's Customize Options — or by re-running the installer over it).
$uf = "C:\Program Files\SplunkUniversalForwarder"
if (-not (Test-Path "$uf\bin\splunk.exe")) { Write-Host "[reset] UF not installed — nothing to reset (install it unconfigured: msiexec /i splunkforwarder-x64.msi AGREETOLICENSE=Yes /quiet)"; exit 0 }
Stop-Service SplunkForwarder -ErrorAction SilentlyContinue
foreach ($f in @("$uf\etc\system\local\outputs.conf", "$uf\etc\system\local\inputs.conf", "$uf\etc\apps\SplunkUniversalForwarder\local\inputs.conf")) {
  if (Test-Path $f) { Rename-Item $f ("$f.reset-" + (Get-Date -Format yyyyMMddHHmm)) -Force }
}
Start-Service SplunkForwarder
Write-Host "[reset] SplunkForwarder running with no outputs.conf / inputs.conf in local\. Firewall: nothing to do on the forwarder side."
& "$uf\bin\splunk.exe" list forward-server 2>$null
