# Identidade do Projeto GastroMundi

## Objetivo
Registrar a identidade central do projeto GastroMundi: seu propósito, valores, público-alvo e posicionamento de produto. Este arquivo é a fonte oficial de verdade sobre "o que GastroMundi é".

## Contexto
A identidade do projeto deve ser consultada antes de qualquer decisão de produto, design ou arquitetura. Mudanças neste arquivo exigem alinhamento explícito da equipe.

## Regras Gerais
- A identidade do produto não deve ser alterada sem deliberação registrada em `docs/08_DECISOES/`
- Toda nova feature deve ser validada contra o propósito central descrito aqui
- O tom de voz, os valores e o público-alvo definem limites para UX e cópia

## Validações
- Qualquer proposta que contradiga o propósito central deve ser justificada com ADR
- Features que atendam nichos fora do público-alvo definido devem ser marcadas como exceção

## Permissões
- Apenas membros com papel de `product-owner` ou `founder` podem alterar este arquivo

## Exceções
- Pivotar o produto exige novo arquivo de identidade e deprecação deste, com data registrada

## Auditoria
- Toda alteração deve conter: autor, data, motivo e referência ao ADR correspondente

## Eventos
- `identity.updated` — disparado quando qualquer seção deste arquivo é alterada
- `identity.reviewed` — disparado em revisões periódicas (recomendado: trimestral)

## Configurações Futuras
- Integrar revisão de identidade ao processo de planejamento trimestral
- Criar checklist de validação de identidade para PRs de produto

## Casos de Uso
- Onboarding de novos membros da equipe
- Avaliação de novas oportunidades de produto
- Revisão de roadmap
- Definição de tom de voz para marketing e UX writing

## Critérios de Aceite
- [x] Propósito central do produto está descrito em 1–2 parágrafos
- [x] Público-alvo primário está definido
- [x] Valores do produto estão listados
- [x] Posicionamento competitivo está resumido
- [x] Tom de voz está descrito

---

## Propósito Central

**Visão.** Ser o sistema operacional do balcão à decisão: unificar venda, cozinha, estoque e finanças em uma única plataforma, com uma IA que entende o negócio e age por ele.

**Propósito.** GastroMundi é a plataforma all-in-one de gestão para restaurantes e varejo. Conecta **PDV, Caixa, Pedidos, Cozinha, Estoque, Financeiro, Clientes e Relatórios** em um fluxo único e integrado — onde cada venda se propaga automaticamente para todos os módulos. O **Jarvas**, camada de IA transversal, observa tudo o que acontece, analisa eventos, identifica padrões, gera insights e sugere ações.

**Problema que resolvemos.** Restaurantes e pequenos varejos operam com ferramentas desconectadas: um PDV de um lado, estoque em planilha, financeiro em outro sistema, relatórios feitos à mão. Isso gera retrabalho, erro de caixa, ruptura de estoque e falta de visão. O dono não tem tempo — nem dados confiáveis — para decidir bem.

**Como resolvemos.** Um sistema integrado em que a venda é a transação-fonte: ao vender no PDV, GastroMundi gera o pedido, atualiza o caixa, lança no financeiro, baixa o estoque, atualiza o dashboard e alimenta o Jarvas. Um dado registrado uma vez serve a todos os módulos.

## Público-Alvo

- **Segmento primário:** restaurantes e food service de pequeno e médio porte — lanchonetes, bares, cafeterias, pizzarias, hamburguerias, operações de delivery.
- **Segmento secundário:** varejo de pequeno porte (lojas, mercearias, conveniências) que precisa de PDV + estoque + financeiro integrados.
- **Perfil:** donos e operadores que querem **simplicidade e controle**, não a complexidade de um ERP tradicional.

Os perfis detalhados estão descritos na seção **Personas**.

## Valores

- **A operação em primeiro lugar.** O balcão não pode parar; cada decisão de produto respeita a velocidade do dia a dia.
- **Dado único, verdade única.** Uma informação é registrada uma vez e flui para todos os módulos.
- **Confiabilidade inegociável.** Dinheiro e estoque não admitem erro nem ambiguidade.
- **Simplicidade radical.** Qualquer pessoa da equipe aprende a operar em um dia.
- **Inteligência acionável.** A IA (Jarvas) não enche de gráficos — ela sugere o próximo passo.
- **Segurança e privacidade.** Os dados do negócio são do cliente; isolamento entre estabelecimentos é absoluto.

## Posicionamento

**Para** restaurantes e pequenos varejos que crescem,
**que** perdem dinheiro e tempo com sistemas desconectados e controles manuais,
**GastroMundi é** uma plataforma de gestão all-in-one
**que** integra PDV, caixa, cozinha, estoque, financeiro e relatórios com uma IA que orienta decisões.
**Diferente de** PDVs isolados ou ERPs complexos,
**GastroMundi** entrega integração total com simplicidade de uso — e o Jarvas transforma a operação em inteligência.

| Alternativa | Limitação | Vantagem do GastroMundi |
|-------------|-----------|------------------|
| PDV isolado | Não fala com estoque/financeiro; controles manuais | Tudo integrado a partir da venda |
| Planilhas | Erro humano, sem tempo real, não escala | Dado único, automático e em tempo real |
| ERP tradicional | Caro, complexo, lento de implantar | Simples, rápido de adotar, IA acionável |

## Tom de Voz

GastroMundi se comunica como um(a) parceiro(a) de operação experiente: direto, prático e que entende a correria do balcão.

- **Direto e objetivo.** Sem rodeios — a equipe está ocupada.
- **Prático.** Fala em termos do negócio (venda, comanda, sangria, ruptura), não em jargão técnico.
- **Confiável.** Quando envolve dinheiro ou estoque, é preciso e transparente.
- **Em português (pt-BR)** como idioma padrão da marca e do produto.

Exemplos:
- ✅ "Caixa fechado. Diferença de R$ 0,00. Tudo certo."
- ❌ "Operação de fechamento de sessão de caixa concluída com êxito."

---

## Manifesto

> **Do balcão à decisão, tudo num lugar só.**

1. **O balcão não pode parar.** Performance e confiabilidade no PDV são sagradas.
2. **Um dado, registrado uma vez, serve a todos.** Nada de digitar a mesma venda em três sistemas.
3. **Tecnologia que se aprende em um dia.** Se precisa de treinamento longo, falhamos.
4. **A IA trabalha nos bastidores.** O Jarvas observa e sugere sem atrapalhar a operação.
5. **Decisão boa é decisão com o dado na hora certa.** Informação tarde demais não vale nada.
6. **O dono no controle, mesmo longe do balcão.** Visão do negócio na palma da mão.
7. **Dinheiro e estoque são levados a sério.** Precisão antes de tudo.

## Personas

### 1. Sr. Antônio — Dono / Proprietário (decisor)
- **Contexto:** dono de um restaurante de médio porte; nem sempre está no local.
- **Dores:** não sabe a margem real; descobre rupturas e furos de caixa tarde demais.
- **Objetivos:** ver faturamento, lucro e o que mais vende; confiar nos números.
- **Sucesso com GastroMundi:** abre o app e vê a saúde do negócio; o Jarvas o avisa do que precisa de atenção.

### 2. Carla — Gerente
- **Contexto:** toca a operação no dia a dia.
- **Dores:** fechar caixa é trabalhoso; controle de estoque vive desatualizado; falta visão da equipe.
- **Objetivos:** operar sem atrito, fechar caixa sem divergência, evitar ruptura.
- **Sucesso com GastroMundi:** caixa, estoque e pedidos integrados; menos planilha, menos erro.

### 3. João — Operador de Caixa / PDV
- **Contexto:** atende o cliente no balcão, na pressão da fila.
- **Dores:** sistema lento trava a fila; difícil aplicar desconto ou dividir conta.
- **Objetivos:** vender rápido e sem erro.
- **Sucesso com GastroMundi:** PDV ágil, poucos toques, sem travar.

### 4. Bea — Cozinha
- **Contexto:** produz os pedidos.
- **Dores:** comandas em papel se perdem; ordem de produção confusa.
- **Objetivos:** ver pedidos claros, na ordem certa, e marcar prontos.
- **Sucesso com GastroMundi:** painel de cozinha (KDS) com os pedidos em tempo real.

## Princípios do Produto

1. **Velocidade na operação.** O PDV é otimizado para vender rápido.
2. **Integração total.** Tudo parte da venda e flui automaticamente entre módulos.
3. **Resiliência operacional.** A operação não pode depender de condições perfeitas (meta: tolerância a falhas de rede).
4. **Simplicidade antes de poder.** Preferimos cobrir 90% dos casos com clareza a 100% com complexidade.
5. **IA acionável (Jarvas).** Insight só vale se vier com uma sugestão de ação.
6. **Multi-tenant por padrão.** Cada estabelecimento tem seus dados isolados.

## Identidade da Marca

- **Nome:** GastroMundi — o núcleo (core) e o coração da operação.
- **Essência:** o centro que conecta e dá ritmo ao negócio.
- **Personalidade:** ágil, confiável, inteligente, descomplicada.
- **Promessa:** "Do balcão à decisão, tudo num lugar só."
- **O que NÃO somos:** um PDV isolado; um ERP complexo; um chatbot genérico.
- **Aplicação visual:** definida em `docs/02_DESIGN_SYSTEM/` (cores, tipografia e tokens são a fonte de verdade visual).

## Roadmap

> Roadmap direcional de produto. Datas são intenções, não compromissos. Itens detalhados de execução vivem em `docs/09_BACKLOG/`.

### Fase 0 — Fundação (atual)
- Documentação, identidade e arquitetura do produto.

### Fase 1 — Núcleo operacional
- **PDV**, **Caixa** e **Pedidos** integrados — o coração da venda.

### Fase 2 — Produção e abastecimento
- **Cozinha (KDS)** e **Estoque** com baixa automática por venda.

### Fase 3 — Gestão
- **Financeiro**, **Clientes** e **Relatórios**.

### Fase 4 — Inteligência (Jarvas)
- Camada de IA transversal: insights, alertas, detecção de padrões e sugestões de ação.

### Fase 5 — Escala
- Multi-loja, integrações (delivery, pagamentos), emissão fiscal e recursos enterprise.
