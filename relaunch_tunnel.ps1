$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "Matando procesos previos de node y cloudflared..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$TunnelLog = Join-Path $ProjectDir "tunnel_session.log"
if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force }

Write-Host "Iniciando Node.js..."
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden

Write-Host "Iniciando cloudflared..."
$CloudflaredExe = Join-Path $ProjectDir "cloudflared.exe"
Start-Process -FilePath $CloudflaredExe -ArgumentList "tunnel --url http://localhost:3000" -WorkingDirectory $ProjectDir -RedirectStandardError $TunnelLog -WindowStyle Hidden

Write-Host "Esperando URL del tunel..."
$TunnelURL = $null
$Timeout = 40
$Elapsed = 0

while (-not $TunnelURL -and $Elapsed -lt $Timeout) {
    Start-Sleep -Seconds 2
    $Elapsed += 2
    if (Test-Path $TunnelLog) {
        $LogContent = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
        if ($LogContent -match 'https://([a-z0-9]+-[a-z0-9\-]+\.trycloudflare\.com)') {
            $TunnelURL = "https://" + $Matches[1]
        }
    }
}

if ($TunnelURL) {
    Write-Host "NUEVO TUNEL ENCONTRADO: $TunnelURL"
    $TunnelJsonPath = Join-Path $ProjectDir "current_tunnel.json"
    $TunnelJson = "{""url"":""$TunnelURL"",""updated"":""$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')""}"
    [System.IO.File]::WriteAllText($TunnelJsonPath, $TunnelJson, [System.Text.Encoding]::UTF8)
    
    git add current_tunnel.json
    git commit -m "auto: fresh live tunnel -> $TunnelURL"
    git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push origin main
    Write-Host "TUNEL PUBLICADO EXITOSAMENTE A GITHUB!"
} else {
    Write-Host "ERROR: No se pudo obtener la URL de cloudflared."
}
