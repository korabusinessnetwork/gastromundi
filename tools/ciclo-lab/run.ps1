# Driver do laboratório — loop infinito de rodadas

param(
  [int]$MaxRodadas = 0,   # 0 = sem teto, roda até STOP
  [string]$LabDir = "D:\projetos\pdv-lab",
  [string]$VaultDir = "D:\Vault\kora"
)

$ErrorActionPreference = "Stop"
$env:KORA_VAULT = $VaultDir

# Verificações de pré-voo
if (-not (Test-Path $LabDir)) {
  Write-Error "Laboratório não encontrado em $LabDir — rode bootstrap.ps1 primeiro"
  exit 1
}

if (-not (Test-Path "$LabDir\.claude\commands\ciclo-lab.md")) {
  Write-Error "Comandos não instalados em $LabDir\.claude\commands"
  exit 1
}

Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║         Laboratório de Ciclo Contínuo — PDV Haiku 4.5         ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "Lab: $LabDir"
Write-Host "Vault: $VaultDir"
Write-Host "Máximo de rodadas: $(if ($MaxRodadas -eq 0) { 'sem teto' } else { $MaxRodadas })"
Write-Host ""
Write-Host "Arquivo STOP: $LabDir\STOP"
Write-Host "  Para parar: New-Item $LabDir\STOP (e a próxima rodada vai encerrar)"
Write-Host ""
Write-Host "Log de custo: $LabDir\.loop\custo.csv"
Write-Host "Executando..."
Write-Host ""

# Inicia com valores zerados
$rodada = 0
$custTotal = 0
$custo_csv = "$LabDir\.loop\custo.csv"

# Cabeçalho do CSV se for novo
if (-not (Test-Path $custo_csv)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $custo_csv) -Force | Out-Null
  "rodada,entrada_tokens,saida_tokens,custo_usd,duracao_seg,timestamp" | Out-File -Encoding UTF8 $custo_csv
}

# Loop principal
while ($true) {
  $rodada++

  # Verifica arquivo STOP
  if (Test-Path "$LabDir\STOP") {
    Write-Host "🛑 Arquivo STOP encontrado — encerrando."
    Remove-Item "$LabDir\STOP" -Force
    break
  }

  # Verifica limite de rodadas
  if ($MaxRodadas -gt 0 -and $rodada -gt $MaxRodadas) {
    Write-Host "✓ Limite de $MaxRodadas rodadas atingido."
    break
  }

  Write-Host "╔─ Rodada $rodada ─────────────────────────────────────────────╗"
  $relogioInicio = Get-Date

  # Executa uma rodada
  $saida = & claude -p "/ciclo-lab" `
    --model claude-haiku-4-5 `
    --permission-mode acceptEdits `
    --output-format json 2>&1

  $codigoSaida = $LASTEXITCODE
  $duracao = ((Get-Date) - $relogioInicio).TotalSeconds

  # Parse da resposta
  $custoUsd = 0
  try {
    $json = $saida | ConvertFrom-Json
    $custoUsd = [double]($json.usage.cost // 0)
  } catch {
    # Falha silenciosa no parse — continua
  }

  $custTotal += $custoUsd

  # Grava no CSV
  $linha = "$rodada,,,${custoUsd},$duracao,$(Get-Date -Format 'u')"
  $linha | Out-File -Encoding UTF8 -Append $custo_csv

  # Status
  if ($codigoSaida -eq 0) {
    Write-Host "✓ Rodada $rodada concluída (custo: \$$custoUsd, duração: ${duracao}s)"
  } else {
    Write-Host "⚠ Rodada $rodada falhou (código: $codigoSaida). Continuando..."
    # Log em run.log
    "[{0:s}] Rodada {1} — exit code {2}`r`n{3}`r`n" -f (Get-Date -Format 'u'), $rodada, $codigoSaida, $saida | `
      Out-File -Encoding UTF8 -Append "$LabDir\.loop\run.log"
  }

  Write-Host "║ Custo acumulado: \$$custTotal"
  Write-Host "╚════════════════════════════════════════════════════════════════╝"
  Write-Host ""

  # Pequena pausa antes da próxima (evita 100% CPU)
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "┌────────────────────────────────────────────────────────────────┐"
Write-Host "│ Loop encerrado"
Write-Host "│ Rodadas: $rodada"
Write-Host "│ Custo total: \$$custTotal"
Write-Host "│ Log: $LabDir\.loop\run.log"
Write-Host "│ CSV: $custo_csv"
Write-Host "└────────────────────────────────────────────────────────────────┘"
