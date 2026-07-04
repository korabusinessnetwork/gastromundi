# Restrições do Projeto GastroMundi

## Objetivo
Registrar restrições permanentes do projeto: o que não pode ser feito, por que, e quais limites técnicos, legais, éticos ou de negócio existem.

## Contexto
Restrições existem para proteger o produto, os usuários e o negócio. Ignorá-las gera débito técnico, riscos legais ou inconsistências de produto. Este arquivo é consultado antes de qualquer proposta de nova feature ou mudança arquitetural.

## Regras Gerais
- Nenhuma restrição pode ser ignorada sem registro de exceção formal em `docs/08_DECISOES/`
- Restrições legais têm prioridade máxima e não podem ser overridadas
- Restrições técnicas devem ser revisadas quando a stack evoluir

## Validações
- Toda nova feature deve passar por checklist de restrições antes do desenvolvimento
- Restrições de segurança exigem validação do tech lead

## Permissões
- Apenas `founder` ou `product-owner` podem remover uma restrição
- Qualquer membro pode propor uma nova restrição

## Exceções
- Exceções a restrições devem ser aprovadas em reunião formal e registradas com prazo de revisão

## Auditoria
- Data de criação e última revisão de cada restrição devem ser registradas
- Revisão periódica: semestral

## Eventos
- `restriction.added` — nova restrição registrada
- `restriction.lifted` — restrição removida com justificativa
- `restriction.exception` — exceção pontual aprovada

## Configurações Futuras
- Criar checklist automatizado de restrições para PRs
- Integrar restrições de compliance ao pipeline de CI

## Casos de Uso
- Avaliação de novas features
- Onboarding de desenvolvedores
- Auditorias de segurança e compliance
- Revisão de roadmap

## Critérios de Aceite
- [ ] Cada restrição tem categoria, justificativa e data
- [ ] Restrições estão organizadas por tipo (técnica, legal, de produto, ética)
- [ ] Status de cada restrição está atualizado

---

## Restrições Técnicas

- **Nunca** expor a chave `service_role` do Supabase no frontend — apenas a chave `anon` pública é permitida no cliente.
- **Não** armazenar dados sensíveis ou tokens de longa duração em `localStorage`; usar mecanismos seguros de sessão.
- **RLS obrigatório** em todas as tabelas: nenhuma tabela vai a produção sem políticas de isolamento por tenant.
- **Não** acessar o Supabase diretamente de componentes de UI — sempre pela camada de serviços (decisão 007).
- **Não** usar `latest` em dependências críticas; versões fixadas (ver `docs/01_ARQUITETURA/tech-stack.md`).
- Lógica de negócio sensível **não** deve viver no cliente; vai para Edge Functions ou backend.

## Restrições Legais / Compliance

- **LGPD (e GDPR quando aplicável):** dados pessoais só são tratados com base legal válida; nada de compartilhamento sem consentimento.
- O usuário tem direito a **exportar e excluir** seus dados (portabilidade e esquecimento) — recurso previsto no roadmap.
- Dados de clientes de um tenant **nunca** podem vazar para outro tenant (isolamento multi-tenant é requisito legal e de confiança).
- Logs e auditoria **não** devem conter dados pessoais sensíveis em texto claro.

## Restrições de Produto

- GastroMundi **não** é um PDV isolado nem um ERP complexo, e o Jarvas **não** é um chatbot genérico — propostas que desviem do foco em gestão integrada de restaurante-varejo (a partir da venda) exigem ADR.
- Recursos exclusivos de planos pagos (pro/enterprise) **não** podem ser expostos no plano free sem decisão registrada.
- **Não** introduzir conteúdo "zumbi": todo documento é mantido vivo ou marcado explicitamente como obsoleto (manifesto nº 7).
- Toda nova feature deve ter regras de negócio documentadas **antes** de entrar em desenvolvimento (ver `docs/09_BACKLOG/`).

## Restrições Éticas

- **Não** coletar dados de menores sem consentimento parental verificado.
- O Jarvas (IA do GastroMundi) **não** inventa números nem fatos sobre o negócio: insights e sugestões são fundamentados nos dados reais dos módulos (ver `docs/03_REGRAS_DE_NEGOCIO/JARVAS.md`) ou explicitamente marcados como incertos.
- **Não** usar dados de clientes para treinar modelos sem consentimento explícito.
- Transparência: o usuário sempre sabe quando está interagindo com IA e de onde vem a informação.
