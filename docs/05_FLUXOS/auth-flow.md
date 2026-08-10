# Fluxo de Autenticação — GastroMundi

## Objetivo
Documentar o fluxo completo de autenticação do GastroMundi: cadastro, login, logout, recuperação de senha e verificação de e-mail.

## Contexto
Autenticação é gerenciada pelo Supabase Auth. O fluxo usa JWT com refresh token automático. O frontend detecta o estado de sessão via listener do Supabase SDK.

## Regras Gerais
- Usuário não autenticado é redirecionado para `/login` ao tentar acessar rota protegida
- Sessão é mantida via cookie HttpOnly gerenciado pelo Supabase
- Token de refresh é renovado automaticamente pelo SDK
- Logout invalida a sessão no servidor e limpa o estado local

## Validações
- E-mail deve ser verificado antes de acessar funcionalidades protegidas
- Link de verificação expira em 24 horas
- Link de recuperação de senha expira em 1 hora
- Tentativas de login com falha (> 5) disparam bloqueio temporário

## Permissões
- Qualquer usuário não autenticado pode acessar: `/login`, `/register`, `/forgot-password`
- Rotas protegidas exigem sessão válida

## Exceções
- Usuário pode continuar usando o produto com e-mail não verificado por até 24h (grace period)
- A operação técnica pode usar `service_role` apenas em scripts de manutenção (nunca via frontend)

## Auditoria
- Login, logout e falhas de autenticação devem ser registrados com IP e timestamp
- Alterações de senha geram notificação por e-mail

## Eventos
- `auth.signup` — novo usuário criado
- `auth.login` — sessão iniciada
- `auth.logout` — sessão encerrada
- `auth.password.reset.requested` — recuperação solicitada
- `auth.password.reset.completed` — senha alterada com sucesso
- `auth.email.verified` — e-mail verificado
- `auth.login.failed` — tentativa de login com falha

## Configurações Futuras
- OAuth: Google, GitHub, Microsoft
- Magic Link (login sem senha)
- Autenticação de dois fatores (TOTP)
- SSO corporativo (SAML)

## Casos de Uso
- UC01: Usuário novo se cadastra com e-mail e senha
- UC02: Usuário existente faz login
- UC03: Usuário esqueceu a senha e solicita recuperação
- UC04: Usuário verifica e-mail após cadastro
- UC05: Usuário encerra sessão

## Critérios de Aceite
- [ ] Cadastro cria usuário no Supabase Auth e perfil em `public.profiles`
- [ ] E-mail de verificação é enviado após cadastro
- [ ] Login com credenciais inválidas retorna erro claro
- [ ] Rota protegida redireciona para login se não autenticado
- [ ] Logout limpa sessão e redireciona para `/login`
- [ ] Link de recuperação de senha funciona e expira corretamente

---

## Fluxo: Cadastro

```
[Tela /register]
    │
    ├── Preenche: nome, e-mail, senha
    │
    ├── Valida: e-mail único, senha forte
    │
    ├── [Supabase] supabase.auth.signUp()
    │       │
    │       ├── Sucesso → cria perfil em public.profiles
    │       │         → envia e-mail de verificação
    │       │         → redireciona para /verify-email
    │       │
    │       └── Erro → exibe mensagem de erro
```

## Fluxo: Login

```
[Tela /login]
    │
    ├── Preenche: e-mail, senha
    │
    ├── [Supabase] supabase.auth.signInWithPassword()
    │       │
    │       ├── Sucesso → redireciona para /dashboard
    │       │
    │       └── Erro (credenciais inválidas) → exibe erro
    │               └── > 5 falhas → bloqueio temporário + alerta
```

## Fluxo: Aviso de sessão expirando (inatividade)

```
[login]
    │
    └── contagem de inatividade (30 min) — qualquer atividade zera:
        mousemove, teclado, clique, toque, roda do mouse, rolagem
            │
            ├── 28 min sem atividade → aviso "Você ainda está aí?"
            │       com o tempo restante correndo (2:00 → 0:00)
            │       │
            │       ├── "Continuar conectado", ou qualquer atividade
            │       │        → aviso some e a contagem recomeça do zero
            │       │
            │       └── nada acontece → 30 min → logout
            │
            └── teto absoluto de 8h desde o login → logout mesmo em uso
```

---

## Sessão no app real (estado atual)

O fluxo acima com Supabase Auth é o modelo-alvo (ADR-002). Hoje o login é próprio,
contra a tabela `usuarios`, e a sessão vive em `sessionStorage` (`kora_session`) —
ver ADR-004. As regras de tempo em vigor, todas em `src/utils/session.js`:

| Constante | Valor | O que faz |
| --- | --- | --- |
| `SESSION_MS` | 8 h | Teto absoluto desde o login. Vence mesmo com o operador usando o sistema — cobre o turno inteiro e não deixa a sessão viver de um dia para o outro. |
| `IDLE_MS` | 30 min | Inatividade. Qualquer atividade zera a contagem. |
| `AVISO_INATIVIDADE_MS` | 2 min | Quanto antes do fim da inatividade o aviso aparece. |
| `MAX_ATTEMPTS` | 5 | Tentativas de login erradas antes do bloqueio. |
| `LOCKOUT_MS` | 2 min | Duração do bloqueio. |
| `JANELA_TENTATIVAS_MS` | 15 min | Janela em que as tentativas erradas são contadas. |

### Por que existe o aviso

A sessão vencia calada: em horário de pico o operador voltava do salão, tocava na
tela e caía no login sem entender por quê — às vezes no meio de um atendimento.
Agora, faltando 2 minutos, aparece um aviso central com o tempo correndo e um botão
grande "Continuar conectado".

- **Um cronômetro só.** O aviso e o logout nascem do mesmo `reset` dentro de
  `useIdleTimer` (`src/utils/hooks.js`), então não têm como sair de sincronia.
- **Não pede decisão de quem só voltou a trabalhar:** mexer no mouse, digitar,
  tocar na tela, rolar ou usar a roda já derruba o aviso e reinicia os 30 minutos.
  O botão existe para o PDV de toque e para dar uma ação óbvia a quem está olhando.
- **O contador conta pelo relógio**, não somando ticks: aba em segundo plano faz o
  navegador atrasar timers, e um contador por subtração mentiria sobre o tempo que sobra.
- Componente: `src/components/shared/AvisoSessao.jsx` (+ `.css`), montado uma vez
  dentro do `AppProvider`, do mesmo jeito que o `IndicadorRede`.

## Fluxo: Recuperação de Senha

```
[Tela /forgot-password]
    │
    ├── Informa e-mail
    │
    ├── [Supabase] supabase.auth.resetPasswordForEmail()
    │
    ├── E-mail enviado (com link de 1h)
    │
    ├── [Link no e-mail] → /reset-password?token=...
    │
    ├── Informa nova senha
    │
    └── [Supabase] supabase.auth.updateUser({ password })
            │
            ├── Sucesso → redireciona para /login
            └── Erro (token expirado) → orientar re-solicitação
```
