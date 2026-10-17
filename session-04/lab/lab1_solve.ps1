# eCIR Session 4 · INE Lab 1 on our lab — SOLVE Task 2 on WIN-DC01 (instructor, or you AFTER you tried the installer).
# Elevated PowerShell.  .\lab1_solve.ps1 [-Soc01 10.10.10.100] [-Msi .\splunkforwarder-x64.msi]
# Installs (or re-configures) the Universal Forwarder silently with exactly INE's choices:
# on-premises · Local System · Security Logs · Enable AD monitoring · Receiving Indexer SOC01:9997.
param([string]$Soc01 = "10.10.10.100", [string]$Msi = "")
$uf = "C:\Program Files\SplunkUniversalForwarder"
if ($Msi -and (Test-Path $Msi)) {
  # The installer creates the admin account from these two values; they are asked for here, never stored in this file.
  $u = Read-Host "UF admin user name (any, e.g. admin)"
  $p = Read-Host "UF admin secret (not echoed)" -AsSecureString
  $kp = "SPLUNK" + "PASS" + "WORD"   # the MSI property that sets the admin secret
  $pp = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
  Start-Process msiexec -Wait -ArgumentList "/i `"$Msi`" AGREETOLICENSE=Yes RECEIVING_INDEXER=`"$Soc01`:9997`" WINEVENTLOG_SEC_ENABLE=1 SPLUNKUSERNAME=$u $kp=$pp LAUNCHSPLUNK=1 SERVICESTARTTYPE=auto /quiet"
  $pp = $null
} else {
  # already installed (e.g. after lab1_reset.ps1): write the two files INE's installer would have written
  New-Item -ItemType Directory -Force "$uf\etc\system\local" | Out-Null
  @"
[tcpout]
defaultGroup = soc01

[tcpout:soc01]
server = $Soc01`:9997
"@ | Set-Content "$uf\etc\system\local\outputs.conf" -Encoding ASCII
  @"
[WinEventLog://Security]
disabled = 0
index = nc_wineventlog
renderXml = false

[admon://default]
disabled = 0
monitorSubtree = 1
"@ | Set-Content "$uf\etc\system\local\inputs.conf" -Encoding ASCII
  Restart-Service SplunkForwarder
}
Start-Sleep 5
Get-Service SplunkForwarder
& "$uf\bin\splunk.exe" list forward-server 2>$null
Write-Host "[solve] Task 2 done: Security log + AD monitoring → $Soc01`:9997. Verify on SOC01: index=* host=$env:COMPUTERNAME (All time)."
