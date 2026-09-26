$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "  |  SISTEMA CASA AYALA - INICIANDO          |" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Matar procesos anteriores
Write-Host "  [1/5] Liberando procesos anteriores..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Iniciar servidor Node.js en ventana propia
Write-Host "  [2/5] Iniciando servidor Node.js (puerto 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Servidor Casa Ayala && node server.js" -WorkingDirectory $ProjectDir -WindowStyle Normal
Start-Sleep -Seconds 3
Write-Host "         OK - Servidor Node.js corriendo." -ForegroundColor Green

# 3. Iniciar tunel Cloudflare
Write-Host "  [3/5] Iniciando tunel Cloudflare..." -ForegroundColor Yellow
$TunnelLog = Join-Path $ProjectDir "tunnel_session.log"
if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force }

$CloudflaredExe = Join-Path $ProjectDir "cloudflared.exe"
$TunnelProcess = Start-Process -FilePath $CloudflaredExe -ArgumentList "tunnel --url http://localhost:3000" -WorkingDirectory $ProjectDir -RedirectStandardError $TunnelLog -WindowStyle Hidden -PassThru

# 4. Esperar la URL
Write-Host "  [4/5] Esperando URL del tunel (max 45 seg)..." -ForegroundColor Yellow
$TunnelURL = $null
$Timeout = 45
$Elapsed = 0

while (-not $TunnelURL -and $Elapsed -lt $Timeout) {
    Start-Sleep -Seconds 2
    $Elapsed += 2
    Write-Host "         ($Elapsed/$Timeout seg) buscando URL..." -ForegroundColor DarkGray

    if (Test-Path $TunnelLog) {
        $LogContent = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
        if ($LogContent -match 'https://([a-z0-9\-]+\.trycloudflare\.com)') {
            $TunnelURL = "https://" + $Matches[1]
        }
    }
}

if (-not $TunnelURL) {
    Write-Host ""
    Write-Host "  [ERROR] No se obtuvo URL del tunel." -ForegroundColor Red
    Write-Host "  Verifique que cloudflared.exe este en la carpeta." -ForegroundColor Red
    Read-Host "  Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "  OK - Nueva URL del tunel:" -ForegroundColor Green
Write-Host "       $TunnelURL" -ForegroundColor Cyan
Write-Host ""

# 5. Actualizar current_tunnel.json y publicar en GitHub
Write-Host "  [5/5] Publicando nueva URL del tunel a GitHub..." -ForegroundColor Yellow

$TunnelJsonPath = Join-Path $ProjectDir "current_tunnel.json"
$TunnelJson = "{""url"":""$TunnelURL"",""updated"":""$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')""}"
[System.IO.File]::WriteAllText($TunnelJsonPath, $TunnelJson, [System.Text.Encoding]::UTF8)
Write-Host "         current_tunnel.json actualizado." -ForegroundColor Green

git add current_tunnel.json 2>&1 | Out-Null
git commit -m "auto: tunel Cloudflare -> $TunnelURL" 2>&1 | Out-Null
$PushResult = git push 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "         GitHub actualizado. En 5 min todos los dispositivos usaran la nueva URL." -ForegroundColor Green
} else {
    Write-Host "         Advertencia: git push fallo. URL guardada solo localmente." -ForegroundColor DarkYellow
}

# Resultado final
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "  |         SISTEMA LISTO                    |" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Tunel activo:  $TunnelURL" -ForegroundColor Cyan
Write-Host "  Red local:     http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Todos los dispositivos (celular, tablet, otra PC)" -ForegroundColor White
Write-Host "  veran los datos de SQL Server en tiempo real." -ForegroundColor White
Write-Host ""
Write-Host "  Esta ventana puede cerrarse." -ForegroundColor DarkGray
Write-Host "  El servidor y el tunel corren en sus propias ventanas." -ForegroundColor DarkGray
Write-Host ""

Read-Host "  Presiona Enter para cerrar"
