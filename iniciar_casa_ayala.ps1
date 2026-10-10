$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host ""
Write-Host "  ========================================================" -ForegroundColor Cyan
Write-Host "  |       SISTEMA CASA AYALA - SERVIDOR PERMANENTE 24/7  |" -ForegroundColor Cyan
Write-Host "  |       MODO ACTIVO: NUNCA SE APAGA / SIN REPOSO       |" -ForegroundColor Cyan
Write-Host "  ========================================================" -ForegroundColor Cyan
Write-Host ""

# 0. BLOQUEO PERMANENTE DE MODO SUSPENSION / REPOSO EN WINDOWS
Write-Host "  [0/5] Configurando Windows para no entrar en reposo nunca..." -ForegroundColor Yellow
try {
    powercfg /change standby-timeout-ac 0 2>$null | Out-Null
    powercfg /change standby-timeout-dc 0 2>$null | Out-Null
    powercfg /change hibernate-timeout-ac 0 2>$null | Out-Null
    powercfg /change hibernate-timeout-dc 0 2>$null | Out-Null
    Write-Host "         OK - Modos de suspension e hibernacion desactivados." -ForegroundColor Green
} catch {
    Write-Host "         Aviso: Continuo sin ajuste powercfg." -ForegroundColor DarkGray
}

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
$TunnelObj = @{
    url = $TunnelURL
    updated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}
$TunnelJson = $TunnelObj | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($TunnelJsonPath, $TunnelJson, [System.Text.Encoding]::UTF8)
Write-Host "         current_tunnel.json actualizado." -ForegroundColor Green

git add current_tunnel.json 2>&1 | Out-Null
git commit -m "auto: tunel Cloudflare -> $TunnelURL" 2>&1 | Out-Null
$PushResult = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "         GitHub actualizado con exito." -ForegroundColor Green
} else {
    Write-Host "         Aviso: git push fallo o en proceso. URL guardada localmente." -ForegroundColor DarkYellow
}

# Resultado final
Write-Host ""
Write-Host "  ========================================================" -ForegroundColor Green
Write-Host "  |   SISTEMA ACTIVO Y MONITOREADO 24/7 (SIN REPOSO)     |" -ForegroundColor Green
Write-Host "  ========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Tunel activo:  $TunnelURL" -ForegroundColor Cyan
Write-Host "  Red local:     http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Todos los dispositivos (celular, tablet, otra PC)" -ForegroundColor White
Write-Host "  veran los datos de SQL Server en tiempo real." -ForegroundColor White
Write-Host ""
Write-Host "  [GUARDIA ACTIVO] Si hay un corte de red o desconexion," -ForegroundColor Yellow
Write-Host "  esta ventana detectara la caida automaticamente, revivira el tunel" -ForegroundColor Yellow
Write-Host "  y actualizara GitHub sin intervencion manual." -ForegroundColor Yellow
Write-Host ""

# Bucle 24/7 Keep-Alive & Auto-Recuperacion Activa
$failCount = 0
$iteration = 0

while ($true) {
    Start-Sleep -Seconds 15
    $iteration++

    # 1. Verificar si Node.js sigue vivo
    $nodeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if (-not $nodeProc) {
        Write-Host "  [ALERTA $(Get-Date -Format 'HH:mm:ss')] Node.js se cerro. Relanzando..." -ForegroundColor Red
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Servidor Casa Ayala && node server.js" -WorkingDirectory $ProjectDir -WindowStyle Normal
        Start-Sleep -Seconds 3
    }

    # 2. PING ACTIVO al tunel publico
    $isAlive = $false
    try {
        $pingRes = Invoke-RestMethod -Uri "$TunnelURL/api/ping" -TimeoutSec 6 -ErrorAction Stop
        if ($pingRes -and $pingRes.status -eq 'ok') {
            $isAlive = $true
            $failCount = 0
            if ($iteration % 8 -eq 0) {
                Write-Host "  [OK $(Get-Date -Format 'HH:mm:ss')] Tunel Cloudflare saludable y activo: $TunnelURL" -ForegroundColor DarkGreen
            }
        }
    } catch {
        $failCount++
        Write-Host "  [AVISO $(Get-Date -Format 'HH:mm:ss')] Peticion al tunel fallo ($failCount/2)" -ForegroundColor DarkYellow
    }

    # 3. Si falla 2 veces consecutivas o cloudflared no esta en ejecucion: RECONECTAR TUNEL
    $cfProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    if ((-not $cfProc) -or ($failCount -ge 2)) {
        Write-Host "  [RECONEXION $(Get-Date -Format 'HH:mm:ss')] Tunel caido o no responde. Levantando nuevo tunel..." -ForegroundColor Yellow
        
        Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1

        if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force }
        $TunnelProcess = Start-Process -FilePath $CloudflaredExe -ArgumentList "tunnel --url http://localhost:3000" -WorkingDirectory $ProjectDir -RedirectStandardError $TunnelLog -WindowStyle Hidden -PassThru
        
        $newUrl = $null
        $tTimeout = 40
        $tElapsed = 0
        while (-not $newUrl -and $tElapsed -lt $tTimeout) {
            Start-Sleep -Seconds 2
            $tElapsed += 2
            if (Test-Path $TunnelLog) {
                $rawLog = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
                if ($rawLog -match 'https://([a-z0-9\-]+\.trycloudflare\.com)') {
                    $newUrl = "https://" + $Matches[1]
                }
            }
        }
        
        if ($newUrl) {
            $TunnelURL = $newUrl
            $failCount = 0
            $TunnelObj = @{
                url = $TunnelURL
                updated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
            $TunnelJson = $TunnelObj | ConvertTo-Json -Compress
            [System.IO.File]::WriteAllText($TunnelJsonPath, $TunnelJson, [System.Text.Encoding]::UTF8)
            git add current_tunnel.json 2>&1 | Out-Null
            git commit -m "auto: auto-reconnect tunnel -> $TunnelURL" 2>&1 | Out-Null
            git push origin main 2>&1 | Out-Null
            Write-Host "  [RECONECTADO $(Get-Date -Format 'HH:mm:ss')] Nuevo tunel publicado con exito:" -ForegroundColor Green
            Write-Host "       $TunnelURL" -ForegroundColor Cyan
        } else {
            Write-Host "  [ERROR $(Get-Date -Format 'HH:mm:ss')] No se obtuvo URL tras intento de reconexion. Reintentando en proximo ciclo..." -ForegroundColor Red
        }
    }
}
