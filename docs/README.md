# Documentação da GastroMundi

Índice mestre da documentação. As pastas seguem a convenção **numerada** (ordem de leitura sugerida). `memory/` (na raiz do repositório) é a fonte de verdade da **identidade**; `docs/` é a fonte de verdade das **regras de negócio e arquitetura**.

| Pasta | Conteúdo |
|-------|----------|
| [`00_VISAO/`](./00_VISAO/) | Visão e identidade de produto (aponta para `memory/`) |
| [`01_ARQUITETURA/`](./01_ARQUITETURA/) | Arquitetura técnica, stack e infraestrutura |
| [`02_DESIGN_SYSTEM/`](./02_DESIGN_SYSTEM/) | Cores, tipografia, espaçamentos, iconografia, componentes, animações |
| [`03_REGRAS_DE_NEGOCIO/`](./03_REGRAS_DE_NEGOCIO/) | Módulos: PDV, Caixa, Pedidos, Cozinha, Estoque, Financeiro, Clientes, Relatórios, Jarvas |
| [`04_MODELAGEM/`](./04_MODELAGEM/) | Entidades, schema de banco e relacionamentos |
| [`05_FLUXOS/`](./05_FLUXOS/) | Fluxos de uso ponta a ponta |
| [`06_COMPONENTES/`](./06_COMPONENTES/) | Catálogo de componentes (atomic design) |
| [`07_APIS/`](./07_APIS/) | Contratos de API e padrões |
| [`08_DECISOES/`](./08_DECISOES/) | ADRs (registros de decisão de arquitetura) |
| [`09_BACKLOG/`](./09_BACKLOG/) | Features planejadas, bugs e débito técnico |
| [`10_PROMPTS/`](./10_PROMPTS/) | Prompts de IA e templates de mensagem |
| [`_legado/`](./_legado/) | Documentos do produto anterior, arquivados para referência |

> **Nota de auditoria (jun/2026):** a estrutura foi migrada para a convenção numerada na Fase 2 do plano de refatoração. Conteúdo ainda referente ao produto antigo (em `04_MODELAGEM`, `05_FLUXOS`, `09_BACKLOG` e `_legado/`) será revisado nas fases seguintes.
