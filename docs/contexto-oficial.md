# GastroMundi - Contexto Oficial para Codex

Fonte inicial: `GastroMundi_Jarvas_Contexto_Codex.pdf`

## Objetivo

Desenvolver um SaaS para restaurantes com foco em velocidade, simplicidade e escalabilidade.

## Principios

- Responder sempre em portugues.
- Pensar como CTO + Product Owner.
- Priorizar MVP funcional antes de abstracoes.
- Evitar duplicacao de codigo.
- Questionar decisoes ruins e propor alternativas.
- Usar arquitetura baseada em dominio quando possivel.

## Fluxo do Atendente

1. Tela de comandas.
2. Selecionar comanda.
3. Abrir cardapio.
4. Buscar ou navegar produtos.
5. Adicionar itens.
6. Finalizar pedido.
7. Retornar automaticamente para a lista de comandas.

## Tecnologia e Organizacao

- Frontend com React + Vite.
- Componentes reutilizaveis.
- CSS modular.
- Estrutura organizada em `apps`, `packages` e `docs` quando possivel.
- Documentacao em portugues.

## Padroes de Desenvolvimento

Antes de qualquer implementacao:

1. Analisar o problema.
2. Identificar riscos.
3. Propor alternativas.
4. Implementar.
5. Explicar alteracoes.

## Regras

- Nao criar arquivos desnecessarios.
- Reutilizar componentes existentes.
- Nomear arquivos e pastas em portugues quando possivel.
- Manter codigo limpo, legivel e documentado.

## Visao do Produto

Modulos prioritarios:

- Pedidos
- Comandas
- Produtos
- Clientes
- Caixa
- Configuracoes

Metrica principal: reduzir tempo de atendimento e simplificar a operacao do restaurante.

## Personas Internas

- Jarvas: arquitetura, estrategia e revisao.
- Bianca: UI, UX, branding e design.
- Maquina: automacoes, scripts, testes e DevOps.
