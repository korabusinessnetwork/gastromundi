# Filtro de escalação

Use este filtro toda vez que surgir a vontade de perguntar algo ao Matheus.

## As 4 perguntas (em ordem)

1. **Dá para decidir com um default sensato e registrar?** → Decida, escreva em `DECISOES.md`, siga.
2. **Dá para contornar com mock, flag, config ou execução local?** → Contorne, anote em `PENDENCIAS-DO-MATHEUS.md`, siga.
3. **Dá para adiar e fazer outras tarefas antes?** → Marque `[!]`, siga com o que não depende disso.
4. **A ação é irreversível, custa dinheiro, envolve segurança/legal, ou o plano é impossível no núcleo?** → Só aqui você escala.

Se chegou na pergunta 4 com "sim", termine tudo o que der antes e escale numa mensagem só.

## Exemplos: NÃO escala

| Situação | Decisão |
|---|---|
| Plano não diz qual lib de gráficos usar | Escolhe a mais leve compatível com a stack, registra |
| Plano diz "tela de login" mas não diz se tem cadastro | Faz login + cadastro + recuperar senha (padrão esperado), registra |
| Não tem a chave da OpenAI/Anthropic | Adapter com mock que devolve respostas plausíveis, `.env.example`, pendência |
| Build quebrou com erro de dependência | Investiga, fixa versão ou troca de pacote |
| Teste falhando há 3 tentativas | `[!]` com diagnóstico, segue |
| Não sabe a cor da marca | Paleta neutra via tokens/tema do tenant, registra |
| Plano cita integração com sistema que você não conhece | Pesquisa a doc; se não houver, define interface e mocka |
| Precisa de dados de exemplo | Gera seeds realistas |
| Ficou em dúvida entre duas estruturas de pasta | Segue o padrão do projeto ou da `fundacao-de-projeto` |
| Comando pediu permissão e o modo auto negou algo local e seguro | Tenta um caminho alternativo; se não houver, anota como pendência |

## Exemplos: ESCALA

| Situação | Por quê |
|---|---|
| Para continuar precisa rodar migration no banco de produção com dados reais | Irreversível |
| O plano pede deploy em produção / publicar pacote / push para `main` remoto | Afeta o mundo fora do projeto |
| Precisa assinar plano pago ou ativar cobrança | Dinheiro |
| O plano pede raspar dados de uma rede social contra os termos, ou guardar CPF sem necessidade | Legal / LGPD |
| O plano diz "app de delivery" em uma seção e "PDV de balcão" em outra, e são produtos diferentes | Núcleo contraditório, escolher errado joga fora o trabalho |
| Todas as tarefas restantes estão `[!]` | Não há mais o que fazer sozinho |

Mesmo no caso de "núcleo contraditório": se der para construir a base comum primeiro, construa, e só pergunte quando chegar na bifurcação.

## Formato da mensagem de escalação

Uma única mensagem, curta, sem travessão:

```
🛑 Full Automático parado: preciso de você em 1 ponto

O que preciso: <uma frase>
Por que não resolvi sozinho: <irreversível / dinheiro / legal / contradição no plano>

Opções:
A) <opção> (minha recomendação, porque ...)
B) <opção>

Já está pronto: <resumo em 1 a 3 linhas, % das tarefas>
Para retomar: responda A ou B e rode /full-automatico continuar
```

Depois de enviar, `ESTADO.md` fica com `status: AGUARDANDO_MATHEUS` e o motivo. Quando ele responder, registre a resposta em `DECISOES.md`, volte o status para `EXECUTANDO` e continue.
