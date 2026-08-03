# PDV Lab — Instruções para este laboratório

**Herdado do GastroMundi; adaptado para a máquina local.**

## Princípio nº 1 — INTUITIVIDADE

Toda tela tem que ser entendida sem explicação. Rótulo em português do balcão,
a próxima ação sempre visível, estado (vazio / carregando / erro / sucesso)
sempre respondido.

## Padrões

- React + Vite
- Componentes em PascalCase, um por arquivo
- Variáveis e funções de domínio em português (ex: `adicionarItem`), técnicas em
  inglês (ex: `handleSubmit`)
- **Dinheiro é sempre inteiro em centavos.** Nunca float. Nunca.
- CSS separado do JSX (co-localizado com `.css` ao lado de `.jsx`)
- Função pura nova = teste novo
- Sem `console.log` esquecido, sem `TODO` sem justificativa

## Custo

O laboratório roda offline — tudo local. Sem rede, sem API paga. O único custo
é o token do modelo — gerido externamente.

## Segurança

- Nunca hardcodar secrets ou chaves
- Validar entrada do usuário sempre
- Nunca logar dados sensíveis (valores de venda, etc.)
- localStorage pode falhar — sempre try/catch

## Memória

- `/memory/learnings.md` — o que se aprendeu
- `/memory/patterns.md` — padrão que vale repetir
- `/memory/bugs.md` — erro que custou tempo
- `/memory/decisions.md` — decisão que amarra as próximas

Leia antes de cada rodada. Arquivo com CRLF — edite pela ferramenta, não por
script.

## Regras de negócio

Ver `docs/03_REGRAS_DE_NEGOCIO/PDV.md` do GastroMundi. Resumo:

- Modos: balcão, mesa/comanda, retirada, delivery
- Pagamentos: dinheiro (caixa aberto), cartão, Pix, fiado (sem aprovado)
- Totais: itens − descontos + acréscimos; soma de pagamentos = total
- Eventos: iniciada, item.adicionado/removido, pagamento.aprovado/recusado,
  finalizada, cancelada/estornada
- Offline-first: venda registrada localmente, sincroniza depois

## Deploy

Não há. A aplicação roda no `vite preview` (ou dev server) localmente, e as
screenshots do smoke ficam no Obsidian.
