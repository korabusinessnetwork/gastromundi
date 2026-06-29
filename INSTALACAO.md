# Guia de Instalação — GASTROMUNDI by Kora

Ferramentas e configurações necessárias para instalar o sistema na máquina do cliente.

---

## 1. QZ Tray

**O que é:** Middleware de impressão que lê as impressoras instaladas no Windows e as disponibiliza para o sistema via WebSocket local. Necessário para a funcionalidade de impressão de comandas e cupons.

**Download:** https://qz.io/download/

**Instalação:**
1. Baixar o instalador para Windows no link acima
2. Executar e seguir os passos (sem configuração adicional)
3. O QZ Tray iniciará automaticamente na bandeja do sistema (ícone próximo ao relógio)
4. Configurar para iniciar com o Windows (já é o padrão na instalação)

**Verificação:** O ícone do QZ Tray deve aparecer na bandeja. No sistema, acessar **Configurações → Impressão → Impressoras** e clicar em **Conectar** — deve retornar a lista de impressoras do Windows.

---

## 2. Google Chrome

**O que é:** Navegador recomendado para rodar o sistema. O Firefox não suporta todas as APIs utilizadas (WebUSB, WebSocket local com QZ Tray).

**Download:** https://www.google.com/chrome/

**Configuração recomendada:**
- Definir o sistema como página inicial ou criar atalho na área de trabalho
- Ativar "Executar em segundo plano" para manter conexão com QZ Tray
- Desativar atualizações automáticas que podem reiniciar o navegador durante o expediente (opcional)

---

*Atualizado em: Junho 2026*
