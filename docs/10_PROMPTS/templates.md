# Templates de Comunicação — GastroMundi

## Objetivo
Documentar todos os templates de e-mail transacional, mensagens do sistema, notificações e copies de UI do GastroMundi.

## Contexto
Templates de comunicação garantem consistência de tom de voz e reduzem retrabalho. Todo texto que o sistema envia ao usuário (e-mails, notificações, toasts, modais) deve ter seu template registrado aqui.

## Regras Gerais
- Todo template deve seguir o tom de voz definido em `memory/identity.md`
- E-mails transacionais devem ter versão plain-text além do HTML
- Nunca incluir informações sensíveis (senhas, tokens completos) em e-mails
- Links em e-mails devem expirar conforme regras de segurança

## Validações
- Templates de e-mail devem ser testados em Gmail, Outlook e Apple Mail antes de ativar
- Links de verificação e recuperação devem ter expiração definida
- E-mails devem ter opt-out claro para comunicações não transacionais

## Permissões
- Product owner aprova todos os templates antes do uso em produção
- Alterações em templates ativos exigem revisão

## Exceções
- E-mails de sistema crítico (verificação, recuperação de senha) não têm opt-out

## Auditoria
- Versão e data de cada template devem ser registradas
- Taxas de abertura e clique devem ser monitoradas

## Eventos
- `email.sent` — e-mail disparado
- `email.bounced` — e-mail retornou
- `email.clicked` — link no e-mail clicado

## Configurações Futuras
- Internacionalização de templates (pt-BR, en-US)
- A/B testing de subjects e copies
- Template engine visual para não-devs alterarem copies

## Casos de Uso
- Verificação de e-mail após cadastro
- Recuperação de senha
- Confirmação de upgrade de plano
- Convite para membros da equipe
- Alertas de faturamento

## Critérios de Aceite
- [ ] Todos os e-mails transacionais têm template documentado
- [ ] Tom de voz é consistente em todos os templates
- [ ] Plain-text existe para todo template HTML

---

## E-mails Transacionais

### Verificação de E-mail

**Subject:** Confirme seu e-mail no GastroMundi  
**Trigger:** Após cadastro ou alteração de e-mail  
**Expiração do link:** 24 horas

```
Olá, {display_name}!

Confirme seu e-mail para começar a usar o GastroMundi.

[Confirmar e-mail] → {verification_url}

Este link expira em 24 horas.

Se você não criou uma conta no GastroMundi, ignore este e-mail.
```

---

### Recuperação de Senha

**Subject:** Redefinir sua senha no GastroMundi  
**Trigger:** Solicitação de recuperação de senha  
**Expiração do link:** 1 hora

```
Olá,

Recebemos uma solicitação para redefinir a senha da conta associada a este e-mail.

[Redefinir senha] → {reset_url}

Este link expira em 1 hora. Se você não solicitou isso, ignore este e-mail — sua senha não será alterada.
```

---

### Confirmação de Upgrade

**Subject:** Seu plano foi atualizado — bem-vindo ao {plan_name}!  
**Trigger:** Upgrade de plano confirmado

```
Olá, {display_name}!

Seu plano foi atualizado para {plan_name} com sucesso.

A cobrança de {value} foi processada em {payment_method_last4}.

[Acessar o painel] → {dashboard_url}

Dúvidas? Fale conosco em suporte@gastromundi.app
```

---

### Convite de Membro

**Subject:** {inviter_name} convidou você para o GastroMundi  
**Trigger:** Convite enviado por admin/owner

```
Olá!

{inviter_name} convidou você para colaborar no GastroMundi como {role}.

[Aceitar convite] → {invite_url}

Este convite expira em 7 dias.
```

---

## Mensagens do Sistema (UI)

### Toasts de Confirmação

| Ação | Mensagem de Sucesso |
|------|---------------------|
| Salvar perfil | "Perfil atualizado com sucesso." |
| Alterar senha | "Senha alterada. Você precisará fazer login novamente em outros dispositivos." |
| Convidar membro | "Convite enviado para {email}." |
| Cancelar assinatura | "Assinatura cancelada. Você mantém acesso até {end_date}." |

### Modais de Confirmação

| Ação | Título | Mensagem |
|------|--------|---------|
| Excluir conta | "Excluir conta permanentemente?" | "Esta ação não pode ser desfeita. Todos os seus dados serão removidos." |
| Cancelar plano | "Cancelar assinatura?" | "Você perderá acesso às funcionalidades do plano {plan} em {end_date}." |
| Remover membro | "Remover {name} da equipe?" | "O acesso será revogado imediatamente." |
