# NFC-e (modelo 65) — Checklist de "Plugar a Chave" (go-live SEFAZ-RS)

> **Estado do código:** a esteira fiscal está **100% pronta** (Levas 8–14, incluindo
> **contingência offline acionável** — quando a SEFAZ cai, o cupom sai na hora e a nota
> é transmitida depois). Falta só **plugar a chave** (certificado A1 + CSC) e **testar
> em homologação**. Este é o passo-a-passo do dia. Faça **na ordem** — cada bloco
> depende do anterior.
>
> **Regra de ouro (fronteira de segredo):** o **certificado A1 (.pfx + senha)** e o
> **VALOR do CSC** são **segredos**. Vivem **só** em `Deno.env`/Vault da Edge —
> **nunca** em tabela lida pelo app, no front, em `VITE_*`, em log ou no git.
> A tabela `tenant_fiscal_config` guarda só o **id** do CSC (`csc_id`), não o valor.

---

## 0. Pré-requisitos (antes de começar)

- [ ] **Certificado A1** do estabelecimento em mãos (arquivo `.pfx`/`.p12` + senha).
      Único item **pago** (~R$120–250/ano) — decisão do dono. e-CNPJ A1.
- [ ] **Credenciamento** do estabelecimento como emissor de NFC-e na **SEFAZ-RS**
      (grátis, feito no portal da SEFAZ-RS). Necessário para **homologação** e produção.
- [ ] **CSC (Código de Segurança do Contribuinte)** gerado no portal SEFAZ-RS
      (grátis) — anote o **`idToken`** (é o `csc_id`, público) e o **valor** (secreto).
      Gere um par para **homologação** e outro para **produção**.
- [ ] Acesso de **admin** ao projeto **Supabase** (SQL Editor + Secrets + Functions).
- [ ] O usuário que vai operar tem **`gastro_role='admin'`** no `app_metadata` (a RLS
      de escrita fiscal exige admin do próprio tenant).

---

## 1. Aplicar as migrations (Supabase → SQL Editor)

Rodar **na ordem**, uma por vez, no SQL Editor do projeto. São idempotentes.

- [ ] `supabase/migrations/20260731_tenant_fiscal_config.sql` — tabela de config (se ainda não aplicada)
- [ ] `supabase/migrations/20260733_nfce_emitidas.sql` — notas emitidas (se ainda não aplicada)
- [ ] `supabase/migrations/20260734_tenant_fiscal_config_evento.sql` — campos de cancelamento
- [ ] **`supabase/migrations/20260735_tenant_fiscal_config_default_tenant.sql`** — `DEFAULT tenant_atual_id()` no `tenant_id`
- [ ] **`supabase/migrations/20260736_nfce_inutilizacoes.sql`** — tabela de inutilização + coluna `url_inutilizacao`
- [ ] **`supabase/migrations/20260737_tenant_fiscal_config_contingencia.sql`** — estado de contingência (`contingencia_ativa`/`_desde`) + RPC `set_contingencia_fiscal`

**Verificar a RLS depois de aplicar** (a migration já cria as policies, mas confirme):
- [ ] `tenant_fiscal_config`, `nfce_emitidas`, `nfce_inutilizacoes` com **RLS habilitada**
- [ ] `set_contingencia_fiscal(boolean)` com `EXECUTE` só para `authenticated` (o corpo já restringe ao tenant do chamador)
- [ ] `public.tenant_atual_id()` e `public.is_super_admin()` **NÃO** foram revogadas de `PUBLIC`/`anon` (a RLS depende delas)

---

## 2. Injetar os segredos (Supabase → Edge Function Secrets)

> **NUNCA** coloque estes valores em `VITE_*`, no front, numa tabela ou no git.
> São lidos **só** pelas Edge Functions via `Deno.env.get(...)`.

Converter o `.pfx` para base64 (local, terminal):
```bash
base64 -w0 certificado.pfx > cert.b64   # Linux
# base64 -i certificado.pfx | tr -d '\n' > cert.b64   # macOS
```

Setar os secrets (CLI do Supabase ou painel → Edge Functions → Secrets):
- [ ] `NFCE_CERT_A1_BASE64` = conteúdo do `cert.b64`
- [ ] `NFCE_CERT_A1_SENHA` = senha do `.pfx`
- [ ] `NFCE_CSC_VALOR` = **valor** do CSC (o secreto — **não** o `idToken`)

```bash
supabase secrets set NFCE_CERT_A1_BASE64="$(cat cert.b64)" \
  NFCE_CERT_A1_SENHA="<senha-do-pfx>" \
  NFCE_CSC_VALOR="<valor-do-csc>"
```

- [ ] Apagar o `cert.b64` local depois de setar (`rm cert.b64`) — não deixar segredo no disco.

---

## 3. Preencher a configuração fiscal do tenant (tela Config. Fiscal)

Na aplicação, logado como **admin**, ir em **`/app/fiscal`** (Config. Fiscal) e preencher.
Começar em **HOMOLOGAÇÃO** (`ambiente = 2`).

**Identidade:** CNPJ, IE, IM, Razão social, Nome fantasia, CRT (regime).
**Endereço:** UF (`RS`), código do município (IBGE, 7 díg), município, logradouro, número, bairro, CEP.
**Emissão:** `ambiente = Homologação (2)`, `série`, `csc_id` (o **idToken** do CSC — público).
**Endpoints da SEFAZ-RS (homologação):**
- [ ] `url_autorizacao` (NFeAutorizacao4)
- [ ] `url_qrcode` (consulta do QR Code)
- [ ] `url_recepcao_evento` (RecepcaoEvento4 — cancelamento)
- [ ] `url_inutilizacao` (NFeInutilizacao4 — inutilização)
- [ ] Deixar **`ativo` DESLIGADO** até validar em homologação. Ligar só depois de emitir OK.

> As URLs de homologação/produção da SEFAZ-RS vêm do portal da SEFAZ-RS. **Não
> hardcodar** — cada tenant/UF tem as suas (multi-tenant, white-label).

---

## 4. Deploy das Edge Functions

```bash
supabase functions deploy emitir-nfce
supabase functions deploy reenviar-nfce
supabase functions deploy cancelar-nfce
supabase functions deploy inutilizar-nfce
```

- [ ] As 4 funções no ar.
- [ ] **pg_cron** apontando pro `reenviar-nfce` (reprocessa pendências) — configurar/confirmar.

**Teste rápido "sem fingir":** antes até de tudo estar 100%, cada função sem o A1
retorna `status: "sem_chave"` (não simula). Com o A1 setado, ela assina e transmite
de verdade.

---

## 5. Homologação (tpAmb = 2) — validar de ponta a ponta

Fazer **uma venda de teste** e acompanhar cada serviço:

- [ ] **Emissão:** emitir NFC-e de uma venda → esperar `autorizada` (cStat **100**), QR Code válido.
- [ ] **Reenvio:** forçar uma pendência (ou aguardar o cron) → confirmar que reprocessa.
- [ ] **Cancelamento:** cancelar a nota emitida dentro do prazo → `cancelada` (cStat **135/155**).
      ⚠️ Confirmar o **prazo legal** de cancelamento na legislação SEFAZ-RS
      (`LIMITE_CANCELAMENTO_MINUTOS_PADRAO` está em **30 min** — validar).
- [ ] **Inutilização:** inutilizar uma faixa de numeração não usada → `inutilizada` (cStat **102**).
      ⚠️ Confirmar o **leiaute** (Id do `infInut` = 41 díg; cStat 102 = homologada) na
      documentação SEFAZ-RS.
- [ ] **Contingência (SEFAZ fora):** apontar `url_autorizacao` para um endpoint morto (simula SEFAZ caída) →
      emitir uma venda → o cupom deve sair **na hora** em **contingência offline** (tpEmis=9, legenda
      "EMITIDA EM CONTINGÊNCIA OFFLINE" na DANFE, banner âmbar na tela), nota fica `pendente`. Restaurar a URL
      correta → o `reenviar-nfce` (ou nova venda autorizada) transmite a pendente e **desliga** a contingência
      sozinho. Confirmar o toggle em `tenant_fiscal_config.contingencia_ativa`.
      ⚠️ Confirmar os cStat de "serviço paralisado" (**108/109**, marcados `⟵ CONFIRMAR` em `nfceContingenciaDecisao.js`) na tabela oficial SEFAZ-RS.
- [ ] Conferir os XMLs guardados (`nfce_emitidas.xml`, `nfce_inutilizacoes.xml` = procInutNFe).

---

## 6. Virar a chave para PRODUÇÃO (só depois de 5 verde)

- [ ] Trocar os secrets/CSC para os de **produção** (se o CSC de produção for outro).
- [ ] Na Config. Fiscal: `ambiente = Produção (1)` e trocar os **4 endpoints** para os de produção.
- [ ] Ligar **`ativo`**.
- [ ] Emitir **uma** NFC-e real de baixo valor e conferir na SEFAZ-RS + na Receita.
- [ ] Acompanhar as primeiras emissões reais (logs da Edge, sem segredo) por alguns dias.

---

## Referência rápida — cStat que importam

| Serviço         | Sucesso        | Observação                                  |
|-----------------|----------------|---------------------------------------------|
| Autorização     | **100**        | Nota autorizada                             |
| Cancelamento    | **135 / 155**  | Evento registrado (155 = fora do prazo homolog. em alguns casos) |
| Inutilização    | **102**        | Faixa homologada → guarda o procInutNFe     |

## Onde está cada peça no código

- **Núcleos puros:** `src/lib/nfce*.js` (montagem/validação de XML, SOAP, assinatura, desfechos) — testáveis, sem segredo.
- **Assinatura/transmissão (Edge):** `supabase/functions/_shared/nfceTransmissao.ts` (único lugar com `node-forge` + chave privada).
- **Edge Functions:** `supabase/functions/{emitir,reenviar,cancelar,inutilizar}-nfce/`.
- **Front:** `src/lib/fiscal.js` (chamadas às Edge), `src/components/fiscal/` (PainelFiscal, CancelarNfce, InutilizarNumeracao, histórico).
- **Config do tenant:** `src/lib/fiscalConfigRepo.js` + `src/lib/validarConfigFiscal.js` (allow-list de escrita, sem segredo).

---

**Lembrete final:** se algo falhar em homologação, o problema é quase sempre (1) URL do
endpoint errada, (2) CSC/`csc_id` trocados entre homolog./produção, (3) certificado
vencido/senha errada, ou (4) estabelecimento não credenciado como emissor NFC-e na
SEFAZ-RS. Nenhum desses exige mudança de código — são configuração.
