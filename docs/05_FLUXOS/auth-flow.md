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
