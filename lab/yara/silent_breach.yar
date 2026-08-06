/*
   silent_breach.yar  —  Operation Silent Breach (eCIR S6 · Challenge B)
   ITGate Academy · eCIR SOC Lab
   Deploy to:  C:\Tools\YARA\rules\  (WIN-VICTIM01), referenced by yara.bat
   Wired to:   Wazuh active response (FIM new-file -> yara_windows -> rule 108001)

   These rules flag the files the homework attack drops. The lab samples use the
   EICAR test string as safe stand-in content, so EICAR_Test_File catches the
   dropped executables; the name/behaviour rules below are written the way you
   would detect the REAL tools, and double as teaching examples.

   Test by hand:  yara64.exe .\silent_breach.yar C:\SilentBreach-Sandbox
   A `warning:` line is fine; any `error:` line means no rules ran.
*/

rule EICAR_Test_File
{
    meta:
        author      = "ITGate eCIR"
        description = "EICAR AV test string — lab stand-in for dropped malware/dropper payload"
        reference   = "Silent Breach steps 2 & 6 (uploaded + dropped exe)"
        mitre       = "T1204"
        severity    = "high"
    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}

rule Ransom_Note_SilentLock
{
    meta:
        author      = "ITGate eCIR"
        description = "Ransom note / .silentlock encryption marker (ransomware payload)"
        reference   = "Silent Breach payload B-1"
        mitre       = "T1486"
        severity    = "critical"
    strings:
        $a = "YOUR FILES ARE ENCRYPTED" ascii nocase
        $b = ".silentlock" ascii nocase
        $c = "HOW_TO_DECRYPT" ascii nocase
        $d = "silentbreach@evil.corp" ascii nocase
    condition:
        any of them
}

rule Mimikatz_Indicators
{
    meta:
        author      = "ITGate eCIR"
        description = "Mimikatz strings / credential-dumping commands (mimikatz payload)"
        reference   = "Silent Breach payload B-2"
        mitre       = "T1003.001"
        severity    = "critical"
    strings:
        $s1 = "sekurlsa::logonpasswords" ascii nocase
        $s2 = "privilege::debug" ascii nocase
        $s3 = "lsadump::" ascii nocase
        $s4 = "gentilkiwi" ascii nocase
        $s5 = "mimikatz" ascii nocase
        $s6 = "kerberos::" ascii nocase
    condition:
        2 of them
}

rule SharpHound_BloodHound
{
    meta:
        author      = "ITGate eCIR"
        description = "SharpHound/BloodHound AD collection tooling (bloodhound payload)"
        reference   = "Silent Breach payload B-3"
        mitre       = "T1087"
        severity    = "high"
    strings:
        $a = "SharpHound" ascii nocase
        $b = "BloodHound" ascii nocase
        $c = "CollectionMethod" ascii nocase
        $d = "Invoke-BloodHound" ascii nocase
        $e = "_computers.json" ascii nocase
        $f = "_users.json" ascii nocase
    condition:
        2 of them
}

rule Suspicious_Temp_Executable_Name
{
    meta:
        author      = "ITGate eCIR"
        description = "Executable using a system-service-lookalike name dropped in TEMP"
        reference   = "Silent Breach step 6 (svc_host_update.exe)"
        mitre       = "T1036.005"
        severity    = "medium"
    strings:
        $mz = { 4D 5A }                       // PE header
        $n1 = "svc_host_update" ascii nocase
        $n2 = "update_installer" ascii nocase
    condition:
        $mz at 0 and any of ($n*)
}
