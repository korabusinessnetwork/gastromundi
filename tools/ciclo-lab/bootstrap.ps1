# Bootstrap do laboratório de ciclo contínuo — prepara D:\projetos\pdv-lab

param(
  [string]$LabDir = "D:\projetos\pdv-lab",
  [string]$VaultDir = "D:\Vault\kora",
  [string]$SeedDir = (Split-Path -Parent $MyInvocation.MyCommand.Path) + "\seed"
)

$ErrorActionPreference = "Stop"

Write-Host "[bootstrap] criando laboratório em $LabDir ..."

# 1. Cria a árvore principal
if (Test-Path $LabDir) {
  Remove-Item -Recurse -Force $LabDir
}
New-Item -ItemType Directory -Path $LabDir -Force | Out-Null

# 2. Copia a semente
Write-Host "[bootstrap] copiando semente ..."
Copy-Item -Path "$SeedDir\*" -Destination $LabDir -Recurse -Force

# 3. Rename gitignore (`.` no Windows é problemático)
if (Test-Path "$LabDir\gitignore") {
  Move-Item -Path "$LabDir\gitignore" -Destination "$LabDir\.gitignore" -Force
}

# 4. Cria diretórios faltantes
$dirs = @(
  "$LabDir\.claude\commands",
  "$LabDir\.claude\hooks",
  "$LabDir\.loop"
)
$dirs | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

# 5. Copia os comandos do operador (de volta para o repo gastromundi)
$thisDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmdDir = "$thisDir\commands"
$hookDir = "$thisDir\hooks"
$settingsPath = "$thisDir\settings.json"

Write-Host "[bootstrap] copiando comandos e configuração ..."
Copy-Item -Path "$cmdDir\*" -Destination "$LabDir\.claude\commands\" -Force
Copy-Item -Path "$hookDir\*" -Destination "$LabDir\.claude\hooks\" -Force
Copy-Item -Path $settingsPath -Destination "$LabDir\.claude\settings.json" -Force

# 6. Inicia git
Write-Host "[bootstrap] inicializando repositório local ..."
Push-Location $LabDir
try {
  git init --initial-branch=main
  git config core.hooksPath .githooks
  git config user.email "claude@gastromundi.local"
  git config user.name "Claude Haiku Lab"
  git config --local core.autocrlf true  # Preserva CRLF em memory/

  # 8. Primeiro commit
  Write-Host "[bootstrap] primeiro commit ..."
  git add -A
  git commit -m "chore(lab): bootstrap inicial (semente de PDV offline)"
} finally {
  Pop-Location
}

# 9. Cria diretórios do Vault
$vaultDirs = @(
  "$VaultDir\Commits",
  "$VaultDir\Reviews",
  "$VaultDir\Ciclos",
  "$VaultDir\Aprendizados",
  "$VaultDir\Screenshots"
)
$vaultDirs | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

# 10. Status final
Write-Host ""
Write-Host "✓ Laboratório pronto em: $LabDir"
Write-Host "✓ Vault em: $VaultDir"
Write-Host ""
Write-Host "Próximos passos:"
Write-Host "  1. cd $LabDir"
Write-Host "  2. npm install"
Write-Host "  3. npm test  (deve passar - semente verde)"
Write-Host "  4. node tools/smoke.mjs --rota=/"
Write-Host "  5. Depois: .\run.ps1  (inicia o loop infinito)"
