# Padrões de projeto idiomáticos em JS/TS

Só os padrões que realmente aparecem em refatorações de código JS/TS moderno, cada um na forma idiomática (funções e objetos, não hierarquias de classe). Regra geral: **um padrão só entra na proposta se o smell correspondente existir no código real.**

## Adapter (o mais útil em refatorações)

**Quando:** formatos de dados divergentes (legado vs novo, API externa vs modelo interno) sendo tratados com `if` espalhados por N pontos de leitura.

**Forma idiomática:** função normalizadora única na camada de dados. Todos os consumidores chamam a função; nenhum conhece os formatos brutos.

```ts
// Vendas antigas têm `metodo: string`; novas têm `pagamentos: Pagamento[]`.
// Em vez de N leitores checando os dois formatos:
export function normalizarPagamentos(sale: SaleAntiga | SaleNova): Pagamento[] {
  if ("pagamentos" in sale && Array.isArray(sale.pagamentos)) return sale.pagamentos;
  return [{ metodo: sale.metodo, valor: sale.total, recebido: sale.recebido, troco: sale.troco }];
}
```

**Benefício-chave:** evita migração de dados históricos — o formato antigo é adaptado na leitura, pra sempre, num único lugar.

## Strategy (via mapa, nunca via herança)

**Quando:** condicionais sobre o mesmo discriminador repetidas em vários pontos; comportamento varia por "tipo" de algo.

**Forma idiomática:** `Record<Discriminador, Comportamento>`.

```ts
type Comportamento = { calcularTroco: (p: Pagamento) => number; exigeRecebido: boolean };

const POR_METODO: Record<string, Comportamento> = {
  dinheiro: { calcularTroco: (p) => Math.max(0, p.recebido - p.valor), exigeRecebido: true },
  pix:      { calcularTroco: () => 0, exigeRecebido: false },
};

const c = POR_METODO[metodo] ?? POR_METODO_DEFAULT;
```

**Nunca:** `abstract class MetodoPagamento` com `class Dinheiro extends...` — mesma capacidade, dez vezes mais cerimônia.

## Factory (função construtora com validação)

**Quando:** o mesmo objeto-literal complexo é montado à mão em vários lugares (e diverge — campos esquecidos num deles é o bug clássico).

**Forma idiomática:** função que centraliza construção e defaults.

```ts
export function criarComanda(dados: { comanda: string; mesa?: string; garcom: string }): Comanda {
  return {
    id: crypto.randomUUID(),
    comanda: dados.comanda,
    mesa: dados.mesa ?? "",
    apelido: "",
    items: [],
    status: "open",
    total: 0,
    garcom: dados.garcom,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
```

**Sinal de que precisa:** um INSERT que "esquece" campos que o objeto tinha porque cada call site monta o payload por conta própria.

## Repository / Gateway (camada fina sobre a infra)

**Quando:** chamadas ao banco/API espalhadas por componentes; trocar/testar a fonte de dados exige tocar UI.

**Forma idiomática:** módulo com funções nomeadas por operação de domínio, escondendo o client.

```ts
// data/mesas.ts
export async function listarMesas(): Promise<Mesa[]> {
  const { data, error } = await supabase.from("mesas").select("*").order("numero");
  if (error) throw error;
  return data ?? [];
}
export async function salvarLayout(mesas: Pick<Mesa, "numero" | "posicao_x" | "posicao_y">[]) {
  const { error } = await supabase.from("mesas").upsert(mesas, { onConflict: "numero" });
  if (error) throw error;
}
```

**Dose certa:** NÃO crie um repository genérico `BaseRepository<T>` com CRUD abstrato. Funções específicas por necessidade real; genérico só se três repositories concretos ficarem idênticos.

## Observer / Pub-Sub

**Quando:** módulos precisam reagir a eventos sem se conhecerem. Em apps React + backend realtime, **geralmente já existe** (subscriptions do banco, event emitters, contexto). O trabalho do review é identificar o mecanismo existente e reusá-lo — não introduzir um segundo barramento de eventos paralelo.

**Smell relacionado:** duas fontes de verdade sincronizadas manualmente (ex: estado local + canal realtime + refetch). Consolidar num único fluxo de dados.

## Facade

**Quando:** um subsistema com setup verboso (ex: biblioteca de impressão, SDK de pagamento) é chamado de vários lugares repetindo o boilerplate.

**Forma idiomática:** um módulo `lib/impressao.ts` exportando 2-3 funções de alto nível (`imprimirComanda(venda)`), escondendo conexão, formatação e retry.

## Padrões que quase nunca valem em JS/TS de aplicação

- **Singleton via classe** — módulos ES já são singletons; exporte uma instância/funções.
- **Builder** — parâmetros de objeto com defaults (`{ ...defaults, ...opts }`) resolvem 95% dos casos.
- **Visitor, Abstract Factory, Bridge** — quase sempre indireção desnecessária fora de compiladores/frameworks. Se parecer necessário, reavalie o modelo de dados primeiro.
- **Decorator via herança** — composição de funções (`const comLog = (fn) => (...args) => { log(); return fn(...args); }`) é a forma nativa.
