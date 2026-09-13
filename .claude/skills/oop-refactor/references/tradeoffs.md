# Quando NÃO usar OOP — trade-offs e checklist de decisão

A pergunta certa nunca é "como deixar isso mais OOP?" e sim "qual estrutura torna as mudanças prováveis mais baratas?". Este arquivo é o freio da skill.

## Checklist antes de propor qualquer abstração

Responda honestamente para cada abstração proposta (classe, interface, camada, padrão):

1. **Existe uma segunda implementação/variação concreta HOJE?** Se não, a abstração é especulativa. Espere ela aparecer. (YAGNI)
2. **Quantos call sites se beneficiam?** 1 → inline, não abstraia. 2 → talvez. 3+ → provavelmente vale. (Rule of three)
3. **A abstração esconde uma decisão que pode mudar, ou só adiciona um salto de navegação?** Indireção sem encapsulamento de decisão é custo puro.
4. **Um dev novo no projeto entende o fluxo em quantos saltos?** Se seguir uma ação exige abrir 5+ arquivos, a estrutura está trabalhando contra a leitura.
5. **O que essa mudança quebra se der errado?** Refatoração em código sem testes tem risco assimétrico — proponha passos menores ou proponha o teste primeiro.

## Classe vs closure vs funções soltas — árvore de decisão

```
Tem estado mutável com invariantes a proteger?
├── NÃO → funções puras num módulo. FIM. (a maioria dos casos)
└── SIM → o estado vive além de uma chamada?
    ├── NÃO → variável local, sem cerimônia
    └── SIM → precisa de MÚLTIPLAS instâncias independentes?
        ├── NÃO → módulo com estado privado no closure (singleton natural do ES)
        └── SIM → factory function retornando objeto, OU classe.
                  Classe ganha se: instanceof importa, há muitos métodos,
                  ou o time já usa classes nesse contexto.
```

**Em React:** a resposta para "onde vive o estado?" é quase sempre hook (useState/useReducer/context) — não classe. Classes em projetos React modernos ficam restritas a: modelos de domínio complexos fora da UI, integrações com SDKs orientados a classe, e error boundaries.

## Herança: os poucos usos legítimos em JS/TS

- `extends Error` para erros customizados (idiomático e útil para `instanceof` em catch).
- `extends Component` apenas em error boundaries (React não oferece hook equivalente).
- Estender classes de frameworks/SDKs que exigem isso por contrato.
- **Todo o resto:** composição. Se dois "filhos" compartilham código, extraia funções compartilhadas — não um pai.

Sinais de que herança existente deve ser desfeita num refactor:
- Subclasse sobrescreve método do pai pra desligar comportamento (violação de Liskov).
- Hierarquia com 3+ níveis.
- Pai com métodos "protected" que só existem pra um filho específico usar.
- Precisar ler o pai E o filho pra entender qualquer fluxo.

## Custos de OOP que a proposta deve pesar explicitamente

| Custo | Quando dói |
|---|---|
| Indireção de leitura | Cada interface/camada é um salto a mais pra entender o fluxo |
| Estado mutável encapsulado | Mais difícil de testar e de raciocinar que dados imutáveis + funções |
| `this` em JS | Bugs de binding em callbacks/handlers; funções não têm esse problema |
| Serialização | Instâncias de classe não sobrevivem a JSON.stringify/parse (relevante em: estado persistido, mensagens, realtime payloads, localStorage) |
| Acoplamento estrutural | Hierarquias são rígidas; requisitos mudam em direções que a hierarquia não previu |

O custo de serialização merece atenção especial em apps com backend JSON (Supabase, Firebase, REST): dados que trafegam como JSON devem ser tipos simples + funções que operam sobre eles, não instâncias.

## Quando OOP (de verdade) se paga

Para não virar dogma ao contrário — casos onde classes/objetos com estado são a resposta certa:

- **Invariantes reais:** um `Dinheiro`/`Money` que garante centavos inteiros e moeda consistente em toda operação. A classe impede estado inválido de existir.
- **Máquinas de estado com transições controladas:** encapsular `status` e permitir só transições válidas evita a classe inteira de bugs "status impossível".
- **Recursos com ciclo de vida:** conexões, subscriptions, timers — objeto com `start/stop` (ou padrão dispose) evita vazamentos.
- **Domínios com vocabulário rico e estável:** se o negócio fala em termos de entidades com comportamento (Pedido.adicionarItem, Comanda.fechar) e essas regras têm dono claro, objetos de domínio deixam o código na língua do negócio.

Mesmo nesses casos: interface pública mínima, sem herança, e os dados saem/entram como tipos simples nas bordas.

## Frase-guia para o fechamento de qualquer review

> "A melhor estrutura é a que torna a próxima mudança provável mais barata — e em JS/TS isso geralmente significa funções puras no núcleo, adaptadores nas bordas, e zero hierarquias."
