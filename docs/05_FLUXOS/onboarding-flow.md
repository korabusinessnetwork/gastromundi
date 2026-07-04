# Fluxo de Onboarding — GastroMundi

## Objetivo
Documentar o fluxo de onboarding do GastroMundi: a jornada do usuário desde o cadastro até estar pronto para usar o produto de forma efetiva.

## Contexto
Onboarding é o primeiro contato real do usuário com o produto após o cadastro. Um onboarding bem executado reduz churn precoce e aumenta ativação. No GastroMundi, o onboarding deve ser concluído antes que o usuário acesse o painel principal.

## Regras Gerais
- Onboarding não deve ter mais de 5 etapas
- Todas as etapas do onboarding são opcionais para avançar, mas incentivadas
- Progresso do onboarding deve ser salvo a cada etapa (não perdido se o usuário fechar)
- Usuário pode pular o onboarding e retornar depois via `/settings/onboarding`

## Validações
- Dados coletados no onboarding devem ser validados antes de salvar
- Onboarding não deve ser exibido novamente após concluído

## Permissões
- Apenas o próprio usuário pode completar seu onboarding
- Dono ou gerente pode visualizar o status de onboarding dos membros do estabelecimento

## Exceções
- Usuários convidados para um estabelecimento (tenant) existente podem ter onboarding simplificado
- Onboarding pode ser reaberto para novos módulos do produto com flag `onboarding_step_x_completed`

## Auditoria
- Conclusão de cada etapa do onboarding deve ser registrada
- Taxa de abandono por etapa deve ser monitorada

## Eventos
- `onboarding.step.completed` — etapa concluída
- `onboarding.completed` — onboarding concluído
- `onboarding.skipped` — usuário pulou o onboarding

## Configurações Futuras
- Onboarding interativo com tour guiado (ex: Shepherd.js ou similar)
- Onboarding personalizado por perfil de usuário
- E-mails de onboarding sequenciais (drip campaign)

## Casos de Uso
- UC01: Usuário novo completa todas as etapas do onboarding
- UC02: Usuário pula o onboarding e acessa o painel diretamente
- UC03: Usuário retorna ao onboarding incompleto
- UC04: Usuário convidado completa onboarding simplificado

## Critérios de Aceite
- [ ] Onboarding é exibido apenas para usuários novos
- [ ] Progresso é salvo a cada etapa
- [ ] Usuário pode pular e retornar depois
- [ ] Onboarding concluído nunca é exibido novamente sem ação do usuário
- [ ] Taxa de conclusão é monitorável

---

## Etapas do Onboarding

```
[Cadastro concluído]
    │
    ▼
[Etapa 1: Boas-vindas]
  → Apresentação do produto
  → CTA: "Começar"
    │
    ▼
[Etapa 2: Perfil]
  → Nome de exibição (pré-preenchido)
  → Foto de perfil (opcional)
  → Função/cargo (opcional)
    │
    ▼
[Etapa 3: Configuração do estabelecimento]
  → Nome do estabelecimento e segmento (restaurante/varejo)
  → Cadastro inicial de produtos (ou importação)
  → Abertura do primeiro caixa (opcional)
    │
    ▼
[Etapa 4: Convite de equipe] (opcional)
  → Convidar membros via e-mail
    │
    ▼
[Etapa 5: Conclusão]
  → Resumo do que foi configurado
  → CTA: "Ir para o painel"
    │
    ▼
[/dashboard]
```
