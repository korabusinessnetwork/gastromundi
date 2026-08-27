# Regras de Negócio — Ponte KORA (Pedidos sem Internet)

## Objetivo
Manter o serviço em pé quando a internet cai: o garçom continua lançando pedidos pelo celular, o pedido chega ao computador do caixa pela rede local (Wi‑Fi do estabelecimento) e a comanda sai na impressora térmica — sem depender do Supabase nem da nuvem.

## Contexto
A Ponte é um programa gratuito (`ponte/dist/KoraPonte.exe`, código em `ponte/servidor.js` + `ponte/lib/`) que roda **no PC do caixa**, sem janela, escutando em `http://localhost:8123`. O celular do garçom abre a página do Palm servida por ela (`ponte/palm.html`); o app do caixa conversa com ela pelo `usePonteLocal` (`src/hooks/usePonteLocal.js`), grava cada pedido na comanda certa em `pending` e manda imprimir. Instalação passo a passo em `ponte/INSTALACAO.md`.

O dono liga o recurso sozinho, em **Configurações → Impressão → aba "Pedidos sem Internet"** (`src/components/desktop/views/impressao/PonteLocalConfig.jsx`). Nada de recompilar o site nem digitar código: a tela mostra um QR gigante e três passos.

## Regras Gerais

### As duas chaves (e por que são duas)
Existem **dois interruptores em série** — a Ponte só funciona quando os dois deixam.

| Chave | Onde mora | Alcance | Padrão | Quem mexe |
|-------|-----------|---------|--------|-----------|
| `VITE_PONTE_LOCAL_ATIVA` | variável de build (`.env.local` / Vercel) | **todos os estabelecimentos de uma vez** | **liberado** | quem opera a plataforma |
| `ponte_local_ativa` | tabela `config` (uma linha por tenant) | **um estabelecimento** | desligado | o dono, na própria tela |

- **`VITE_PONTE_LOCAL_ATIVA` é trava global, não liga/desliga de cliente.** A leitura é `import.meta.env.VITE_PONTE_LOCAL_ATIVA !== "false"` (`src/components/shared/PonteLocalBridge.jsx`): **vazia ou ausente = recurso liberado**; **só o texto exato `false` desliga a Ponte para TODOS os estabelecimentos**. Serve para tirar o recurso do ar em bloco (falha grave, recall) — não para habilitar cliente por cliente.
- O padrão dela é *liberado* de propósito: enquanto o padrão era o contrário, esquecer de defini-la deixava a Ponte desligada em toda build e o recurso nunca recebia um pedido de verdade.
- **Quem liga por estabelecimento é `ponte_local_ativa`** (decisão 017 — SaaS multi‑estabelecimento): chave ausente **é** resposta e significa desligado; quem nunca ligou está desligado.
- A Ponte só entra em ciclo com `VITE_PONTE_LOCAL_ATIVA` liberada **e** `ponte_local_ativa === true` **e** desktop **e** alguém logado.

### Vínculo e operação
- A Ponte se vincula sozinha ao estabelecimento (id e nome do tenant) quando o sistema abre naquele computador — o gerente não digita código nenhum.
- O endereço do Palm descoberto pela Ponte é guardado na config `ponte_endereco` (`usePonteLocal`): é por ele que o celular do garçom acha o caminho da Ponte quando a internet cai (`src/pages/MobilePage.jsx`). O QR da tela de Configurações **não** vem dessa config — é montado na hora com o que a Ponte responde neste computador (`buscarInfoPonte`), então só existe com a Ponte rodando.
- Cada pedido nasce com id no celular do garçom e é deduplicado em três camadas (Palm → Ponte → app), então reenvio por rede instável nunca vira comanda dobrada.
- A Ponte não tem console: a única saída é o `ponte.log` (`ponte/lib/log.js`).

## Validações
- Enquanto o ajuste `ponte_local_ativa` não chegou, a chave da tela **não afirma ligado nem desligado** e fica travada — chutar aqui é chutar se a comanda vai sair na impressora.
- Enquanto o sistema **está abrindo** (inclusive no bootstrap logo depois do login), a tela diz "Carregando o ajuste…" — o `loading` do `AppContext` liga no começo do `bootstrap` e desliga em `finally`, então não existe nem "Carregando…" eterno nem "não deu para carregar" anunciado com o ajuste ainda a caminho.
- Se o sistema **terminou de abrir e o ajuste não veio**, o recado depende da causa, e cada causa tem o seu botão: **sem internet** (abriu da cópia local salva, e ela é antiga demais para conhecer a chave) a tela diz "Sem internet agora — quando a conexão voltar, toque no botão abaixo para buscar o ajuste deste estabelecimento" e oferece **"Já voltou a internet? Buscar o ajuste agora"**; o botão "Recarregar a tela" **não** aparece aí, porque recarregar sem rede refaz o mesmo caminho. **Com rede** (o banco recusou a leitura da config) a tela diz que não deu para carregar e oferece "Recarregar a tela", que aí tem chance real de resolver.
- O recado de sem internet **aponta o botão** em vez de prometer que o ajuste chega sozinho: **nada** relê `ponte_local_ativa` por conta própria quando a internet volta — não existe timer, polling nem tentativa em segundo plano. O `bootstrap` roda na abertura do sistema, no login e **quando alguém clica** no botão da tela, que é o mesmo `bootstrap` exposto no contexto como `recarregarDadosDoEstabelecimento` (`src/context/AppContext.jsx`).
- **O botão de buscar o ajuste mostra que está trabalhando e não aceita clique duplo:** enquanto a carga roda ele fica travado e escrito "Buscando o ajuste…" (`disabled`, `src/components/desktop/views/impressao/PonteLocalConfig.jsx`), e continua na tela mesmo com o `loading` do contexto ligado — sumir debaixo do dedo de quem acabou de clicar pareceria que o clique se perdeu. Se a conexão ainda não voltou, o recado passa a ser "Ainda sem internet — tentamos agora e não deu. Toque de novo quando a conexão voltar" e o botão volta a aceitar clique: o dono precisa ver que tentou e não deu, senão conclui que o botão está quebrado.
- **"Sem internet" tem dois sinais, e a tela olha os dois.** `navigator.onLine` (`redeOnline`, via `src/hooks/useStatusRede.js`) só enxerga a placa de rede deste computador; no caso mais comum do restaurante — Wi‑Fi de pé, link do provedor caído — ele continua dizendo "online". Quem enxerga a verdade é o `bootstrap`, que ao esbarrar em erro de rede (`isErroDeRede`, `src/lib/offline/rede.js`) opera com a cópia salva e liga `abriuSemInternet` no `AppContext`. Sem esse segundo sinal, esse cenário caía no recado de falha do banco e ganhava um botão "Recarregar a tela" que não resolvia nada.
- **Com o link do provedor caído, o `bootstrap` só roda porque a restauração de sessão trata falha de rede na leitura do perfil.** Nesse cenário a busca do perfil do usuário logado sai pelo mesmo caminho de rede das outras leituras e falha junto. Se o `AppContext` parasse aí, o `bootstrap` nunca rodaria e ninguém ligaria `abriuSemInternet` — a tela mostraria o recado errado, com botão. Então: **erro de rede na leitura do perfil + sessão local salva = segue para o `bootstrap`** (`src/context/AppContext.jsx`), que hidrata da cópia salva e liga o carimbo. Erro que não é de rede (o banco respondeu e não achou usuário ativo) continua caindo nos ramos de sempre — falha de rede nunca vira logout.
- **O carimbo se apaga de três jeitos, e nenhum deles é sozinho no tempo.** `abriuSemInternet` é zerado (1) no começo de cada nova carga, (2) quando **este computador** reconecta e o navegador avisa (evento `online`, o mesmo que o `redeOnline` escuta) e (3) quando o dono clica em "Já voltou a internet? Buscar o ajuste agora" — que dispara uma carga nova e cai no caso (1). O caso (3) é o que resolve o cenário mais comum do restaurante: link do provedor que volta **sem** o computador ter perdido a rede não emite evento nenhum, então o navegador nunca conta que a internet voltou. Com a conexão de volta, a carga traz o ajuste e a tela se recupera sem fechar o sistema; ainda sem conexão, a carga esbarra em rede outra vez, o carimbo volta e o recado continua dizendo a verdade.
- Com a Ponte rodando e a chave desligada, o QR **não aparece**: o garçom escanearia, mandaria o pedido e ele ficaria parado. A tela avisa antes, em vez de deixar errar.

## Permissões
| Ação | admin | gerente | caixa | garçom |
|------|-------|---------|-------|--------|
| Ligar/desligar `ponte_local_ativa` (Configurações → Impressão) | ✓ | — | — | — |
| Usar o Palm pela Ponte (mandar pedido do celular) | ✓ | ✓ | ✓ | ✓ |
| Mexer em `VITE_PONTE_LOCAL_ATIVA` | — (plataforma) | — | — | — |

> A permissão `configuracoes` (`src/constants/roles.js`) é a que abre a tela, e a matriz de cargos é editável por estabelecimento — o tenant pode conceder `configuracoes` a outro cargo.

## Exceções
- **Trava global ligada (`false`) com o cliente com a chave ligada:** o estabelecimento vê a chave ligada e a Ponte não entra em ciclo. É o preço de ter um freio de mão do produto; por isso o padrão é liberado e o `false` só deve ser usado de forma deliberada e temporária.
- **Ponte não instalada:** a tela cai no caminho de instalação em linguagem de balcão, sem jargão — não é erro, é um passo que falta.
- **Ponte no ar, chave ligada e o celular não alcança:** é o firewall do Windows barrando a porta da Ponte, e o bloqueio é silencioso — no PC do caixa tudo parece certo. Quem resolve é o painel da própria Ponte (botão "Liberar o celular no Wi-Fi"), não esta tela; a criação da regra é ação separada e pedida ao dono porque o Windows exige administrador (`POST /firewall/liberar`).
- **Falha ao gravar a chave:** o estado volta ao anterior e a tela avisa; chave que volta sozinha sem explicação parece defeito.

## Auditoria
- **Ligar/desligar `ponte_local_ativa` não deixa registro de auditoria hoje.** O caminho inteiro é `setPonteLocalAtiva` → `gravarConfig` (`src/context/AppContext.jsx`), e `gravarConfig` faz só o `upsert` em `config` (mais `reportarFalha` quando o banco recusa). Nenhum setter de config chama `logAction`, e não há trigger no banco fazendo isso por baixo.
- Os registros de operador ficam na tabela **`operator_logs`** (`src/lib/logger.js`) — não em `activity_log`. Do `AppContext` só escrevem lá `auth:login`, `auth:logout`, `venda:cancelar` e as ações de caixa.
- Registrar a troca desta chave é **pendência** (ver "Configurações Futuras"): quem auditar hoje não vai achar quem ligou nem quando.
- Recebimento e confirmação de pedidos ficam no `ponte.log` do computador do caixa.

## Eventos Disparados
- Nenhum evento novo do Event Bus: o pedido vindo da Ponte entra em `pending` como qualquer comanda e segue a taxonomia de `PEDIDOS.md`/`COZINHA.md`.

## Configurações Futuras
- Registro de auditoria da troca de `ponte_local_ativa` (quem ligou/desligou e quando), em `operator_logs` como as demais ações de operador.
- Porta configurável por estabelecimento (hoje `8123`, sobrescrita só por `KORA_PONTE_PORTA` no PC).
- Mais de um computador recebendo pedidos no mesmo salão.

## Casos de Uso
- A internet cai no meio do movimento: o garçom continua lançando pelo celular e a comanda sai na impressora.
- O dono acabou de instalar a Ponte, liga a chave, aponta a câmera do celular no QR e prepara os aparelhos da equipe.
- A plataforma precisa tirar o recurso do ar em todos os clientes: define `VITE_PONTE_LOCAL_ATIVA=false` e publica.

## Critérios de Aceite
- [x] `VITE_PONTE_LOCAL_ATIVA` vazia/ausente mantém o recurso liberado; só `false` desliga para todos
- [x] `ponte_local_ativa` liga/desliga por estabelecimento, na própria tela do dono
- [x] Chave travada e sem afirmar estado enquanto o ajuste não chegou
- [x] Recado honesto quando o ajuste não pôde ser carregado, e cada causa com o botão que resolve ela: "Recarregar a tela" com rede, "Já voltou a internet? Buscar o ajuste agora" sem internet
- [ ] Troca de `ponte_local_ativa` registrada em `operator_logs` (hoje não há registro nenhum)
- [x] QR só aparece com a chave ligada
