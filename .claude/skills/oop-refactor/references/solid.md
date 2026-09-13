# SOLID traduzido para JavaScript/TypeScript

Cada princípio com: o que significa na prática em JS/TS, como detectar violação num code review, e o exemplo de refatoração idiomática (quase nunca envolve herança).

## S — Single Responsibility (um motivo pra mudar)

**Tradução JS/TS:** um módulo/hook/componente deve mudar por um único motivo de negócio. Não é "fazer uma coisa só" — é "ter um único dono de mudança".

**Detecção em review:**
- Componente React que busca dados, formata, valida formulário E renderiza modal → 4 motivos de mudança.
- Arquivo `utils.js` genérico crescendo sem parar (é um balde, não um módulo).

**Refatoração idiomática:**
```ts
// ANTES: componente faz tudo
function Checkout() {
  const [pagamentos, setPagamentos] = useState([]);
  // 80 linhas de lógica de divisão de valores em centavos
  // + 60 linhas de JSX
}

// DEPOIS: lógica pura extraída (testável sem React)
// pagamentos.ts
export function dividirEmCentavos(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / n);
  const resto = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}

// Checkout.tsx — só orquestração de UI
```

## O — Open/Closed (estender sem editar)

**Tradução JS/TS:** adicionar uma variante nova não deve exigir editar código existente. A ferramenta idiomática é **mapa de estratégias**, não hierarquia de classes.

**Detecção em review:**
- `switch (tipo)` ou cadeia `if/else if` sobre o mesmo discriminador aparecendo em 2+ arquivos. Adicionar um tipo novo = caçar todos os switches.

**Refatoração idiomática:**
```ts
// ANTES: cada método de pagamento novo exige editar este switch (e os outros 4 iguais)
function iconeDo(metodo: string) {
  switch (metodo) {
    case "dinheiro": return LuBanknote;
    case "pix": return LuQrCode;
    // ...
  }
}

// DEPOIS: registro único; variante nova = uma linha num único lugar
const METODOS: Record<string, { label: string; Icon: IconType; temTroco: boolean }> = {
  dinheiro: { label: "Dinheiro", Icon: LuBanknote, temTroco: true },
  pix:      { label: "Pix",      Icon: LuQrCode,   temTroco: false },
};
```

**Cuidado:** só vale quando as variantes JÁ existem em número ≥ 2 e crescem. Um `if` de dois ramos estáveis não precisa disso.

## L — Liskov Substitution (subtipo não surpreende)

**Tradução JS/TS:** qualquer implementação de um contrato deve funcionar onde o contrato é esperado, sem o chamador checar qual implementação é. Em TS isso vale para interfaces e union types, não só classes.

**Detecção em review:**
- `if (x instanceof AlgumaClasse)` ou `if ("campoEspecial" in obj)` no meio de código genérico.
- Implementação que lança `throw new Error("not supported")` pra parte do contrato.
- Função que aceita `Pagamento` mas se comporta diferente se `pagamento.metodo === "dinheiro"` em lugares que não deviam saber disso.

**Refatoração idiomática:** ou o contrato é estreito demais (divida — veja I), ou o comportamento especial pertence à própria variante (mova para o registro de estratégias com um campo/função a mais, como `temTroco` acima).

## I — Interface Segregation (contratos pequenos)

**Tradução JS/TS:** quem consome só deveria conhecer o que usa. Em TS: prefira várias interfaces pequenas a uma gorda; em funções, receba o mínimo (o campo, não o objeto inteiro).

**Detecção em review:**
- Função que recebe `sale` inteiro mas só lê `sale.total`.
- Interface `Repository` com 15 métodos onde cada consumidor usa 2.
- Props drilling de objeto gigante quando o filho usa um campo.

**Refatoração idiomática:**
```ts
// ANTES
function formatarTroco(sale: Sale) { return fmt(sale.troco); }
// DEPOIS — testável sem montar um Sale inteiro
function formatarTroco(troco: number) { return fmt(troco); }
```

## D — Dependency Inversion (núcleo depende de contrato)

**Tradução JS/TS:** lógica de negócio não deve importar detalhes de infra (supabase, fetch, localStorage) diretamente. Recebe as operações por parâmetro ou importa de uma camada adaptadora fina. **Não precisa de framework de DI** — passagem de parâmetro e module boundaries resolvem.

**Detecção em review:**
- `import { supabase } from "../lib/supabase"` dentro de funções de cálculo/regra.
- Impossível testar uma regra de negócio sem mockar rede.

**Refatoração idiomática:**
```ts
// ANTES: regra acoplada à infra
async function fecharCaixa() {
  const { data } = await supabase.from("sales").select("*");
  return somarPorMetodo(data);
}

// DEPOIS: regra pura + casca imperativa
export function somarPorMetodo(vendas: Sale[]): Record<string, number> { /* puro */ }

// na borda (componente/página):
const { data } = await supabase.from("sales").select("*");
const totais = somarPorMetodo(data ?? []);
```

## Ordem de prioridade num review real

Na prática, violações de **S** (deus-módulos) e **D** (infra vazando pro núcleo) causam a maior parte da dor em codebases JS/TS. **O** vem em seguida quando há switches duplicados. **L** e **I** aparecem menos e costumam ser consequência de consertar os outros. Não force os cinco em toda revisão.
