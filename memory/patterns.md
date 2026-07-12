# Padrões do Projeto GastroMundi

## Objetivo
Registrar padrões consolidados de código, arquitetura, UX e processo que a equipe adotou oficialmente. Este arquivo é a referência definitiva de "como fazemos aqui".

## Contexto
Padrões surgem de decisões repetidas. Quando a mesma solução é adotada três ou mais vezes, ela deve ser elevada a padrão e registrada aqui. Padrões reduzem fricção, inconsistências e retrabalho.

## Regras Gerais
- Um padrão só entra aqui após ser validado em produção ou revisão técnica
- Padrões devem ter exemplos concretos quando possível
- Padrões obsoletos devem ser marcados como `[DEPRECADO]` com data e motivo

## Validações
- Novos padrões devem ser propostos via PR com referência a, no mínimo, dois casos de uso reais
- Padrões de segurança exigem revisão do tech lead antes de serem adotados

## Permissões
- Qualquer desenvolvedor pode propor um padrão
- Aprovação exige consenso da equipe técnica (mínimo 2 revisores)

## Exceções
- Em casos de urgência, um padrão pode ser adotado provisoriamente com tag `[EXPERIMENTAL]`
- Padrões experimentais têm prazo de 30 dias para validação ou descarte

## Auditoria
- Data de adoção de cada padrão deve ser registrada
- Revisões periódicas recomendadas: trimestrais

## Eventos
- `pattern.added` — novo padrão consolidado
- `pattern.deprecated` — padrão marcado como obsoleto
- `pattern.revised` — padrão atualizado

## Configurações Futuras
- Criar linter ou checklist automatizado baseado nos padrões documentados
- Integrar este arquivo ao processo de code review como referência obrigatória

## Casos de Uso
- Onboarding técnico de novos devs
- Code review
- Decisões de refatoração
- Avaliação de bibliotecas e ferramentas

## Critérios de Aceite
- [ ] Cada padrão tem nome, contexto, exemplo e justificativa
- [ ] Padrões estão organizados por categoria
- [ ] Status de cada padrão está atualizado

---

## Padrões de Código

### Nomenclatura de Componentes
- Componentes em **PascalCase** (ex.: `UserCard`, `BillingPanel`).
- Um componente por arquivo; o nome do arquivo acompanha o nome do componente (`UserCard.tsx`).
- Hooks customizados em **camelCase** com prefixo `use` (ex.: `useCurrentTenant`).
- Tipos e interfaces em **PascalCase**; constantes globais em **UPPER_SNAKE_CASE**.
- Eventos de domínio em **dot.case** no passado/substantivo (ex.: `decision.added`), conforme convenção do Event Bus.

### Estrutura de Arquivos
- Organização **por feature/módulo**, não por tipo técnico: cada módulo agrupa seus componentes, hooks e serviços.
- Código compartilhado entre módulos vive em uma camada comum (ex.: `shared/`).
- Acesso ao backend isolado em uma camada de serviços, nunca espalhado direto nos componentes — facilita troca futura de provedor (ver `memory/decisions.md`).
- Convenção de pastas detalhada e exemplos visuais em `docs/06_COMPONENTES/` e `docs/03_REGRAS_DE_NEGOCIO/`.

### Gerenciamento de Estado
- **Estado de servidor** (dados do backend): gerenciado por camada de data-fetching com cache; nunca duplicado em estado global manual.
- **Estado global de UI** (sessão, tenant atual, tema, feature flags): exposto via Context API (ver `docs/01_ARQUITETURA/overview.md`).
- **Estado local**: mantido no componente sempre que não precisar ser compartilhado.
- Regra de ouro: elevar estado apenas quando há mais de um consumidor real.

---

## Padrões de API

### Formato de Resposta
- Respostas seguem envelope consistente com `data`, `error` e `meta` (paginação/cursor quando aplicável).
- Toda resposta é validada por schema (Zod) antes de chegar à UI; dados fora do contrato são rejeitados explicitamente.
- Contrato canônico de endpoints e exemplos em `docs/07_APIS/`.

### Tratamento de Erros
- Erros têm **código estável** (string), mensagem legível e, quando útil, detalhes por campo.
- Falhas nunca são silenciadas: a UI sempre reflete o erro de forma acionável.
- Erros esperados (validação, permissão) são tratados localmente; erros inesperados sobem para uma fronteira de erro global.
- Padrão detalhado em `docs/07_APIS/error-handling.md`.

---

## Padrões de UI/UX

### Feedback de Ações do Usuário
- Toda ação do usuário gera feedback visível em até 100ms (otimista) ou com indicador de progresso.
- Sucesso, erro e estado vazio são tratados explicitamente — nunca uma tela "muda".
- Mensagens seguem o tom de voz definido em `memory/identity.md`.

### Estados de Loading
- Três estados sempre considerados: **carregando**, **vazio** e **erro**, além do estado de sucesso.
- Preferir *skeletons* a spinners em telas com layout previsível.
- Evitar saltos de layout (layout shift) ao carregar conteúdo.

---

## Padrões de Processo

### Fluxo de PR
- Branches curtas e focadas; um PR resolve uma unidade lógica de trabalho.
- Todo PR referencia o item de backlog ou ADR correspondente.
- PR só entra com descrição clara, critérios de aceite atendidos e checagens automáticas verdes.

### Revisão de Código
- Mínimo de **1 revisor** para mudanças comuns; **2 revisores** para segurança, dados ou arquitetura.
- Revisão verifica aderência aos padrões deste arquivo e às restrições em `memory/restrictions.md`.
- Feedback é sobre o código, nunca sobre a pessoa (ver cultura em `memory/learnings.md`).

### Fluxo de entrega com dois Claudes (implementa-aqui → aplica-no-VS-Code)
*Adotado em 2026-07-12. Método de trabalho entre o Claude do ambiente remoto (Cowork/web) e o Claude Code do VS Code local.*

Divisão de trabalho que evita o vaivém de copiar arquivo à mão e mantém o
Git como fonte única de verdade:

1. **Claude remoto (aqui) implementa e versiona.** Escreve o código
   (front, RPC/migrations, Edge Functions), roda `npm test`, **commita e
   dá push** na branch de trabalho designada. O código nasce completo e
   testado no Git — não em texto colado no chat.
2. **Claude do VS Code aplica o que exige a máquina/painel do dono.** Puxa
   a branch (`git pull`) e executa só o que o Claude remoto **não** tem
   acesso para fazer: aplicar migrations no Supabase (SQL Editor),
   deployar Edge Functions, subir `npm run dev` para validar local, mexer
   em variáveis de ambiente/Vercel.
3. **O handoff é um prompt curto e explícito**, não o código: qual branch
   puxar, qual migration aplicar (e onde), o que testar. O código já está
   no Git; o prompt só diz o que fazer com ele.

Regras do fluxo:
- **Git é a ponte, nunca o copiar-e-colar.** Nada de mandar arquivo inteiro
  no chat para o dono colar — isso diverge e perde histórico. Push primeiro.
- **Cada Claude faz só o que pode fazer com segurança.** O remoto não tem a
  service_role nem o painel; o do VS Code tem a máquina do dono. Respeitar a
  fronteira evita segredo vazado e passo cego.
- **Toda migration nova avisa que precisa ser aplicada** no Supabase antes de
  o front que depende dela funcionar (senão vira erro `function ... does not
  exist`). O aviso vai explícito no handoff.
- **Destino final é sempre a `main`** (workflow "tudo direto na main",
  decisão do dono em 2026-07-12): valida local → merge na `main` → Vercel
  publica sozinha.
