param([int]$TimeoutMinutes = 30)
$ErrorActionPreference = 'Stop'
if ($TimeoutMinutes -lt 1 -or $TimeoutMinutes -gt 180) { throw 'TimeoutMinutes must be between 1 and 180' }
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class PresentationFreeShortPath {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetShortPathName(string source, StringBuilder result, uint count);
  public static string Resolve(string source) {
    var result = new StringBuilder(32768);
    if (GetShortPathName(source, result, 32768) == 0) throw new System.ComponentModel.Win32Exception();
    return result.ToString();
  }
}
'@
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path (Split-Path -Parent $projectRoot) 'tools'
$overrides = @{
  GHIDRA_INSTALL_DIR = [PresentationFreeShortPath]::Resolve((Join-Path $toolsRoot 'ghidra_12.1.4_PUBLIC'))
  JAVA_HOME = [PresentationFreeShortPath]::Resolve((Join-Path $toolsRoot 'jdk-21.0.12.1+1'))
  USERPROFILE = [PresentationFreeShortPath]::Resolve($env:USERPROFILE)
  TEMP = [PresentationFreeShortPath]::Resolve($env:TEMP)
  TMP = [PresentationFreeShortPath]::Resolve($env:TEMP)
  REA_GHIDRA_STARTUP_TIMEOUT_MS = [string]($TimeoutMinutes * 60000)
  GHIDRA_HEADLESS_MAXMEM = '4G'
}
$original = @{}
try {
  foreach ($key in $overrides.Keys) {
    $original[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
  }
  Push-Location $projectRoot
  try { & node (Join-Path $PSScriptRoot 'analyze-ppcore.cjs'); if ($LASTEXITCODE -ne 0) { throw "Analysis exited $LASTEXITCODE" } }
  finally { Pop-Location }
} finally {
  foreach ($key in $original.Keys) { [Environment]::SetEnvironmentVariable($key, $original[$key], 'Process') }
}
