import "math"

/*
   windows_baseline_threats.yar  —  General Windows threat/tool detection
   ITGate Academy · eCIR SOC Lab
   Deploy to:  C:\Tools\YARA\rules\  (any Windows victim), wired to Wazuh
   active response the same way as silent_breach.yar (FIM new-file -> yara.bat).

   PURPOSE: general-purpose signatures for the tools/behaviours a real attacker
   actually drops or runs — not tied to one attack script. These complement
   Windows_Security_Baseline_Rules.xml / Sysmon_Baseline_Rules.xml: those catch
   the BEHAVIOUR (command lines, event IDs), these catch the FILE/TOOL itself.

   Test by hand:  yara64.exe .\windows_baseline_threats.yar <path>
   A `warning:` line is fine; any `error:` line means no rules ran.
*/

rule Mimikatz_Strings
{
    meta:
        author      = "ITGate eCIR"
        description = "Mimikatz binary or script containing known module/command strings"
        mitre       = "T1003.001"
        severity    = "critical"
    strings:
        $s1 = "sekurlsa::logonpasswords" ascii nocase
        $s2 = "privilege::debug" ascii nocase
        $s3 = "lsadump::" ascii nocase
        $s4 = "gentilkiwi" ascii nocase
        $s5 = "mimikatz" ascii nocase
        $s6 = "kerberos::ptt" ascii nocase
    condition:
        2 of them
}

rule CobaltStrike_Beacon_Indicators
{
    meta:
        author      = "ITGate eCIR"
        description = "Strings/artifacts commonly found in Cobalt Strike beacon payloads"
        mitre       = "T1071.001"
        severity    = "critical"
    strings:
        $s1 = "%s (admin)" ascii
        $s2 = "beacon.dll" ascii nocase
        $s3 = "ReflectiveLoader" ascii
        $s4 = "%%SPAWNTO%%" ascii
        $s5 = "beacon_" ascii nocase
        $s6 = { 73 70 72 6E 67 00 }  // "sprng\x00" default CS pipe fragment (heuristic)
    condition:
        2 of them
}

rule SharpHound_BloodHound
{
    meta:
        author      = "ITGate eCIR"
        description = "SharpHound/BloodHound AD collection tooling"
        mitre       = "T1087"
        severity    = "high"
    strings:
        $a = "SharpHound" ascii nocase
        $b = "BloodHound" ascii nocase
        $c = "CollectionMethod" ascii nocase
        $d = "Invoke-BloodHound" ascii nocase
        $e = "_computers.json" ascii nocase
        $f = "_users.json" ascii nocase
        $g = "ldap://" ascii nocase
    condition:
        2 of them
}

rule Ransom_Note_Generic
{
    meta:
        author      = "ITGate eCIR"
        description = "Generic ransom note language and known extension markers"
        mitre       = "T1486"
        severity    = "critical"
    strings:
        $a = "YOUR FILES ARE ENCRYPTED" ascii nocase
        $b = "HOW_TO_DECRYPT" ascii nocase
        $c = "your files have been encrypted" ascii nocase
        $d = "to decrypt your files" ascii nocase
        $e = "bitcoin" ascii nocase
        $f = "restore your files" ascii nocase
    condition:
        2 of them
}

rule PowerShell_AMSI_Bypass
{
    meta:
        author      = "ITGate eCIR"
        description = "Common AMSI bypass code patterns embedded in a script or dropped file"
        mitre       = "T1562.001"
        severity    = "critical"
    strings:
        $a = "amsiInitFailed" ascii nocase
        $b = "AmsiUtils" ascii nocase
        $c = "AmsiScanBuffer" ascii nocase
        $d = "[Ref].Assembly.GetType" ascii nocase
    condition:
        2 of them
}

rule Generic_Webshell_Script
{
    meta:
        author      = "ITGate eCIR"
        description = "Common webshell command-execution patterns (ASPX/PHP/JSP)"
        mitre       = "T1505.003"
        severity    = "high"
    strings:
        $php1  = "<?php" ascii nocase
        $php2  = "shell_exec(" ascii nocase
        $php3  = "system($_" ascii nocase
        $php4  = "passthru(" ascii nocase
        $aspx1 = "Request.Item" ascii nocase
        $aspx2 = "Process.Start" ascii nocase
        $jsp1  = "Runtime.getRuntime().exec" ascii nocase
    condition:
        ($php1 and 1 of ($php2,$php3,$php4)) or $aspx1 and $aspx2 or $jsp1
}

rule Impacket_PsExec_Artifacts
{
    meta:
        author      = "ITGate eCIR"
        description = "Impacket toolkit / PsExec-style lateral movement artifacts"
        mitre       = "T1021.002"
        severity    = "high"
    strings:
        $a = "impacket" ascii nocase
        $b = "PSEXESVC" ascii nocase
        $c = "wmiexec" ascii nocase
        $d = "smbexec" ascii nocase
        $e = "atexec" ascii nocase
    condition:
        any of them
}

rule Rubeus_Indicators
{
    meta:
        author      = "ITGate eCIR"
        description = "Rubeus Kerberos-abuse tool strings"
        mitre       = "T1558.003"
        severity    = "critical"
    strings:
        $a = "Rubeus" ascii nocase
        $b = "asktgt" ascii nocase
        $c = "kerberoast" ascii nocase
        $d = "s4u" ascii nocase
    condition:
        2 of them
}

rule Suspicious_High_Entropy_PE
{
    meta:
        author      = "ITGate eCIR"
        description = "PE file with a suspiciously small readable-string ratio (packed/obfuscated payload heuristic)"
        mitre       = "T1027"
        severity    = "medium"
    strings:
        $mz = { 4D 5A }
    condition:
        $mz at 0 and filesize < 5MB and filesize > 1KB
        and math.entropy(0, filesize) >= 7.2
}

rule EICAR_Test_File
{
    meta:
        author      = "ITGate eCIR"
        description = "EICAR AV test string — used across all eCIR lab scenarios as a safe malware stand-in"
        mitre       = "T1204"
        severity    = "high"
    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}
