// @vitest-environment jsdom
//
// Run 6, leva 3 — a taxa de entrega na tela precisa ser a do endereço que
// está na tela.
//
// O defeito: o recálculo tem 700 ms de debounce, e o "Calculando a taxa de
// entrega…" só era ligado DENTRO do timer. Nesses 700 ms a taxa exibida
// ainda era a do endereço anterior e o botão "Ir para o pagamento"
// continuava liberado. Dava tempo de trocar o bairro e avançar levando a
// taxa velha: o cliente via R$ 7,50 num endereço que custa R$ 20 (ou que
// nem é atendido). O servidor recalcula na hora de gravar, então a conta
// certa só aparecia no último clique — cobrado a mais, ou recusado depois
// de ter preenchido tudo.
//
// Sem userEvent nem shouldAdvanceTime de propósito: aqui o que se mede é
// exatamente a janela entre a digitação e o disparo do debounce, e ela
// precisa ser controlada no relógio, não no tempo real da máquina.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

const SLUG = "resto";

const { mockCalcularTaxa, mockViaCep, mockGeocodificar } = vi.hoisted(() => ({
  mockCalcularTaxa: vi.fn(),
  mockViaCep: vi.fn(),
  mockGeocodificar: vi.fn(),
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// Só as idas à rede viram dublê — cepCompleto, formatarCep e formatarPreco
// continuam reais.
vi.mock("@/lib/delivery/delivery", async () => {
  const real = await vi.importActual("@/lib/delivery/delivery");
  return {
    ...real,
    calcularTaxaEntrega: mockCalcularTaxa,
    buscarEnderecoViaCep: mockViaCep,
    geocodificarEndereco: mockGeocodificar,
  };
});

import CheckoutEntrega from "./CheckoutEntrega";

const ENTREGA_INICIAL = {
  nome: "",
  telefone: "",
  cep: "",
  bairro: "",
  endereco: "",
  complemento: "",
  taxa: 0,
};

/** Segura o estado da entrega como a CardapioPage segura (patch por patch). */
function Palco({ onAvancar }) {
  const [dados, setDados] = useState(ENTREGA_INICIAL);
  return (
    <CheckoutEntrega
      slug={SLUG}
      dados={dados}
      onMudar={(patch) => setDados((d) => ({ ...d, ...patch }))}
      onVoltar={() => {}}
      onAvancar={onAvancar}
    />
  );
}

const campo = (rotulo) => screen.getByLabelText(rotulo);
const avancar = () => screen.getByRole("button", { name: "Ir para o pagamento" });
const calculando = () => screen.queryByText("Calculando a taxa de entrega…");

function digitar(rotulo, valor) {
  fireEvent.change(campo(rotulo), { target: { value: valor } });
}

/** Deixa o debounce estourar e as promessas assentarem. */
async function assentar(ms = 800) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
  await act(async () => {});
}

/** Nome + endereço + CEP completo, com a taxa já resolvida. */
async function preencherAteTaxa(onAvancar = vi.fn()) {
  await act(async () => {
    render(<Palco onAvancar={onAvancar} />);
  });
  digitar("Seu nome", "Ana");
  digitar("Endereço (rua, número)", "Rua X, 10");
  digitar("CEP", "90000000");
  await assentar();
  return onAvancar;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockViaCep.mockResolvedValue({ data: null, error: null });
  mockGeocodificar.mockResolvedValue({ data: null, error: null });
  mockCalcularTaxa.mockResolvedValue({ data: { ok: true, taxa: 7.5 }, error: null });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CheckoutEntrega — a taxa na tela é a do endereço na tela (Run 6, leva 3)", () => {
  it("com a taxa calculada, o avanço libera com o valor certo", async () => {
    await preencherAteTaxa();

    expect(avancar()).toBeEnabled();
    expect(calculando()).toBeNull();
    expect(screen.getByText("R$ 7,50")).toBeInTheDocument();
  });

  it("trocar o bairro tranca o avanço na hora, antes do debounce disparar", async () => {
    await preencherAteTaxa();
    expect(avancar()).toBeEnabled();

    // Sem adiantar um milissegundo sequer: é exatamente esta janela que
    // deixava passar o pedido com a taxa do endereço anterior.
    digitar("Bairro", "Zona Rural");

    expect(avancar()).toBeDisabled();
    expect(calculando()).toBeInTheDocument();
  });

  it("trocar a rua também tranca — no modo por km o preço vem da coordenada", async () => {
    await preencherAteTaxa();

    digitar("Endereço (rua, número)", "Rua Muito Longe, 9000");

    expect(avancar()).toBeDisabled();
  });

  it("quando a taxa nova chega, o avanço volta já com o valor novo", async () => {
    await preencherAteTaxa();

    mockCalcularTaxa.mockResolvedValue({ data: { ok: true, taxa: 20 }, error: null });
    digitar("Bairro", "Zona Rural");
    await assentar();

    expect(avancar()).toBeEnabled();
    expect(calculando()).toBeNull();
    expect(screen.getByText("R$ 20,00")).toBeInTheDocument();
    expect(screen.queryByText("R$ 7,50")).toBeNull();
  });

  it("endereço novo fora da área não avança com a taxa velha no bolso", async () => {
    const onAvancar = vi.fn();
    await preencherAteTaxa(onAvancar);

    mockCalcularTaxa.mockResolvedValue({ data: { ok: false }, error: null });
    digitar("Bairro", "Outra Cidade");
    await assentar();

    expect(avancar()).toBeDisabled();
    expect(screen.getByText(/fora da nossa área de entrega/)).toBeInTheDocument();
    fireEvent.click(avancar());
    expect(onAvancar).not.toHaveBeenCalled();
  });

  it("apagar um dígito do CEP some com o 'calculando' em vez de deixá-lo girando", async () => {
    await act(async () => {
      render(<Palco onAvancar={vi.fn()} />);
    });
    digitar("Seu nome", "Ana");
    digitar("Endereço (rua, número)", "Rua X, 10");
    digitar("CEP", "90000000");

    expect(calculando()).toBeInTheDocument();

    // Apagou antes do debounce: não há mais o que calcular. Deixar o aviso
    // girando é a tela mentindo que está trabalhando.
    digitar("CEP", "9000000");

    expect(calculando()).toBeNull();
    expect(avancar()).toBeDisabled();
  });

  it("apagar um dígito do CEP tira a taxa da tela em vez de deixar a antiga", async () => {
    await preencherAteTaxa();
    expect(screen.getByText("R$ 7,50")).toBeInTheDocument();

    digitar("CEP", "9000000");

    // O endereço não está mais completo: exibir a taxa do CEP anterior é a
    // tela cobrando por um endereço que já não é o que está no formulário.
    expect(screen.queryByText("R$ 7,50")).toBeNull();
    expect(screen.queryByText(/Taxa de entrega/)).toBeNull();
  });

  it("a taxa nem é pedida enquanto o CEP está incompleto", async () => {
    await act(async () => {
      render(<Palco onAvancar={vi.fn()} />);
    });
    digitar("CEP", "9000");
    await assentar();

    expect(mockCalcularTaxa).not.toHaveBeenCalled();
    expect(avancar()).toBeDisabled();
  });
});

// ──────────────────────────────────────────────────────────────────
// Run 6, leva 6 — o cliente tem que conseguir informar o endereço.
//
// Quatro defeitos, todos na tela mais abandonável do delivery:
//
// D16 — "Buscando endereço…" ficava preso na tela para o resto da sessão.
//   Bastava apagar um dígito do CEP enquanto o ViaCEP respondia: a limpeza
//   do efeito marcava ativo = false, a resposta voltava e caía no return
//   antes de desligar o aviso. A tela anunciava uma busca que não existia
//   mais e o cliente esperava por ela.
//
// D17 — um ViaCEP que falha condenava aquele CEP para sempre. O CEP era
//   marcado como já tentado ANTES de perguntar, então uma piscada de rede
//   virava "esse CEP não preenche nada": redigitar o mesmo CEP não tentava
//   de novo e o cliente digitava bairro e rua à mão sem saber por quê.
//
// D18 — o bairro que o cliente digitou DURANTE a busca era sobrescrito
//   pela resposta do ViaCEP. O efeito lia dados da closure, congelado no
//   instante em que a busca começou (bairro vazio), e passava por cima da
//   correção na frente do cliente.
//
// D19 — quando o cálculo da taxa não respondia (rede caída, RPC fora do
//   ar), a tela não dizia UMA palavra: sem aviso, sem taxa, e o "Ir para o
//   pagamento" desabilitado sem motivo visível. O cliente preenchia tudo e
//   ficava clicando num botão morto, sem beco de saída.
// ──────────────────────────────────────────────────────────────────

const buscando = () => screen.queryByText("Buscando endereço…");
const erroConexao = () =>
  screen.queryByText(/Não conseguimos calcular a taxa de entrega agora/);
const tentarDeNovo = () => screen.getByRole("button", { name: "Tentar de novo" });

/** Promessa que só resolve quando o teste mandar. */
function pendente() {
  let resolver;
  const promessa = new Promise((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

const VIACEP_OK = {
  data: {
    bairro: "Centro",
    logradouro: "Rua das Flores",
    cidade: "Porto Alegre",
    uf: "RS",
  },
  error: null,
};

const RUA_VIACEP = "Rua das Flores - Porto Alegre/RS";

async function montar() {
  await act(async () => {
    render(<Palco onAvancar={vi.fn()} />);
  });
}

describe("CheckoutEntrega — a busca do CEP não pode mentir nem travar (Run 6, leva 6)", () => {
  it("apagar um dígito durante a busca desliga o aviso de que está buscando", async () => {
    const { promessa, resolver } = pendente();
    mockViaCep.mockReturnValue(promessa);
    await montar();

    digitar("CEP", "90000000");
    expect(buscando()).toBeInTheDocument();

    // Aqui estava o furo: a limpeza abandonava a resposta e ninguém mais
    // desligava o aviso — ele ficava na tela pelo resto da sessão.
    digitar("CEP", "9000000");
    expect(buscando()).toBeNull();

    resolver(VIACEP_OK);
    await assentar();
    expect(buscando()).toBeNull();
  });

  it("depois de interromper, redigitar o mesmo CEP busca de novo e preenche", async () => {
    const { promessa, resolver } = pendente();
    mockViaCep.mockReturnValue(promessa);
    await montar();

    digitar("CEP", "90000000");
    digitar("CEP", "9000000");
    resolver(VIACEP_OK);
    await assentar();

    // A busca abandonada não pode carimbar o CEP como resolvido: o cliente
    // ficaria sem bairro e sem rua, para sempre, por ter apagado um dígito.
    expect(campo("Bairro")).toHaveValue("");
    mockViaCep.mockResolvedValue(VIACEP_OK);

    digitar("CEP", "90000000");
    expect(buscando()).toBeInTheDocument();
    await assentar();

    expect(buscando()).toBeNull();
    expect(campo("Bairro")).toHaveValue("Centro");
    expect(campo("Endereço (rua, número)")).toHaveValue(RUA_VIACEP);
  });

  it("ViaCEP que falhou pode ser tentado de novo no mesmo CEP", async () => {
    mockViaCep.mockResolvedValue({ data: null, error: null });
    await montar();

    digitar("CEP", "90000000");
    await assentar();
    expect(campo("Bairro")).toHaveValue("");
    expect(mockViaCep).toHaveBeenCalledTimes(1);
    // Busca que terminou em nada ainda é busca que terminou: deixar o aviso
    // ligado é a tela dizendo que continua trabalhando.
    expect(buscando()).toBeNull();

    // Rede voltou. Redigitar o mesmo CEP é o cliente pedindo para tentar de
    // novo — e antes isso não fazia absolutamente nada.
    mockViaCep.mockResolvedValue(VIACEP_OK);
    digitar("CEP", "9000000");
    digitar("CEP", "90000000");
    await assentar();

    expect(mockViaCep).toHaveBeenCalledTimes(2);
    expect(campo("Bairro")).toHaveValue("Centro");
  });

  it("CEP que respondeu não é buscado de novo à toa", async () => {
    mockViaCep.mockResolvedValue(VIACEP_OK);
    await montar();

    digitar("CEP", "90000000");
    await assentar();
    expect(mockViaCep).toHaveBeenCalledTimes(1);

    digitar("Bairro", "Outro");
    digitar("Seu nome", "Ana");
    await assentar();

    expect(mockViaCep).toHaveBeenCalledTimes(1);
  });

  it("o bairro digitado durante a busca sobrevive à resposta do ViaCEP", async () => {
    const { promessa, resolver } = pendente();
    mockViaCep.mockReturnValue(promessa);
    await montar();

    digitar("CEP", "90000000");
    // O cliente não espera parado: ele digita enquanto a busca roda.
    digitar("Bairro", "Vila Nova");

    resolver(VIACEP_OK);
    await assentar();

    expect(campo("Bairro")).toHaveValue("Vila Nova");
    // A rua, que ele não digitou, o ViaCEP pode preencher.
    expect(campo("Endereço (rua, número)")).toHaveValue(RUA_VIACEP);
  });

  it("a rua digitada durante a busca também sobrevive", async () => {
    const { promessa, resolver } = pendente();
    mockViaCep.mockReturnValue(promessa);
    await montar();

    digitar("CEP", "90000000");
    digitar("Endereço (rua, número)", "Av. Minha, 42");

    resolver(VIACEP_OK);
    await assentar();

    expect(campo("Endereço (rua, número)")).toHaveValue("Av. Minha, 42");
    expect(campo("Bairro")).toHaveValue("Centro");
  });

  it("com os campos vazios, o ViaCEP preenche bairro e rua", async () => {
    mockViaCep.mockResolvedValue(VIACEP_OK);
    await montar();

    digitar("CEP", "90000000");
    await assentar();

    expect(campo("Bairro")).toHaveValue("Centro");
    expect(campo("Endereço (rua, número)")).toHaveValue(RUA_VIACEP);
  });
});

describe("CheckoutEntrega — taxa que não respondeu tem que aparecer na tela (Run 6, leva 6)", () => {
  it("falha no cálculo diz o que aconteceu em vez de deixar o botão morto", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    await preencherAteTaxa();

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/Não conseguimos calcular a taxa de entrega agora/);
    expect(avancar()).toBeDisabled();
    expect(calculando()).toBeNull();
  });

  it("falha no cálculo oferece um caminho de volta, e ele funciona", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    const onAvancar = await preencherAteTaxa();

    expect(erroConexao()).toBeInTheDocument();
    mockCalcularTaxa.mockResolvedValue({ data: { ok: true, taxa: 7.5 }, error: null });

    fireEvent.click(tentarDeNovo());
    expect(calculando()).toBeInTheDocument();
    await assentar();

    expect(erroConexao()).toBeNull();
    expect(screen.getByText("R$ 7,50")).toBeInTheDocument();
    expect(avancar()).toBeEnabled();
    fireEvent.click(avancar());
    expect(onAvancar).toHaveBeenCalled();
  });

  it("corrigir o endereço também limpa o aviso de falha, sem precisar do botão", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    await preencherAteTaxa();
    expect(erroConexao()).toBeInTheDocument();

    mockCalcularTaxa.mockResolvedValue({ data: { ok: true, taxa: 12 }, error: null });
    digitar("Bairro", "Centro");
    await assentar();

    expect(erroConexao()).toBeNull();
    expect(screen.getByText("R$ 12,00")).toBeInTheDocument();
  });

  it("apagar o CEP tira o aviso de falha junto com a taxa", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    await preencherAteTaxa();
    expect(erroConexao()).toBeInTheDocument();

    digitar("CEP", "9000000");

    expect(erroConexao()).toBeNull();
  });

  it("fora da área não é falha de conexão — cada aviso diz a sua verdade", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: { ok: false }, error: null });
    await preencherAteTaxa();

    expect(screen.getByText(/fora da nossa área de entrega/)).toBeInTheDocument();
    expect(erroConexao()).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("endereço que o mapa não achou também não é falha de conexão", async () => {
    mockCalcularTaxa.mockResolvedValue({
      data: { ok: false, motivo: "sem_coordenada" },
      error: null,
    });
    await preencherAteTaxa();

    expect(
      screen.getByText(/Não consegui localizar seu endereço no mapa/)
    ).toBeInTheDocument();
    expect(erroConexao()).toBeNull();
  });

  it("enquanto calcula, nenhum aviso de falha aparece por baixo", async () => {
    mockCalcularTaxa.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    await preencherAteTaxa();
    expect(erroConexao()).toBeInTheDocument();

    digitar("Bairro", "Centro");

    expect(calculando()).toBeInTheDocument();
    expect(erroConexao()).toBeNull();
  });
});

describe("CheckoutEntrega — terceiro pendurado não mata o checkout (Run 6, leva 11)", () => {
  // O defeito: ViaCEP e Nominatim eram chamados com `fetch` puro, sem prazo
  // nenhum. Um socket que abre e não responde fica pendurado por minutos, e
  // no modo "taxa por distância" — o único que depende do Nominatim, um
  // serviço grátis com limite de 1 req/s — isso MATAVA o checkout: a tela
  // ficava em "Calculando a taxa de entrega…" para sempre, o "Ir para o
  // pagamento" nunca liberava e o "Tentar de novo" nem aparecia, porque os
  // dois só existem depois de a busca TERMINAR. O cliente só saía dali
  // recarregando a página, no meio da compra.
  const fetchOriginal = globalThis.fetch;

  function erroDeAbort() {
    const e = new Error("The operation was aborted.");
    e.name = "AbortError";
    return e;
  }

  beforeEach(async () => {
    // Aqui as buscas são as DE VERDADE — o que está sob teste é o prazo
    // delas. Só o `fetch` vira dublê, pendurado como terceiro fora do ar.
    const real = await vi.importActual("@/lib/delivery/delivery");
    mockViaCep.mockImplementation((...args) => real.buscarEnderecoViaCep(...args));
    mockGeocodificar.mockImplementation((...args) => real.geocodificarEndereco(...args));
    globalThis.fetch = vi.fn((_url, opcoes) => {
      if (opcoes?.signal?.aborted) return Promise.reject(erroDeAbort());
      return new Promise((_resolver, rejeitar) => {
        opcoes?.signal?.addEventListener("abort", () => rejeitar(erroDeAbort()));
      });
    });
    // Modo por distância: o servidor pede a coordenada do endereço.
    mockCalcularTaxa.mockResolvedValue({
      data: { ok: false, motivo: "sem_coordenada" },
      error: null,
    });
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    // mockClear não apaga implementação — sem o reset, a geocodificação de
    // verdade vazaria para os testes seguintes.
    mockViaCep.mockReset();
    mockGeocodificar.mockReset();
  });

  it("mapa que não responde não deixa a tela em 'Calculando…' para sempre", async () => {
    await preencherAteTaxa();

    // A geocodificação está correndo: é certo que a tela diga que está
    // calculando e segure o avanço enquanto isso.
    expect(calculando()).toBeInTheDocument();
    expect(avancar()).toBeDisabled();

    await assentar(9000);

    // Sem prazo, nada daqui para baixo acontecia: a tela ficava calculando
    // pelo resto da sessão, com o botão morto e sem uma palavra de aviso.
    expect(calculando()).toBeNull();
    expect(
      screen.getByText(/Não consegui localizar seu endereço no mapa/)
    ).toBeInTheDocument();
  });

  it("busca de CEP que não responde não deixa 'Buscando endereço…' colado na tela", async () => {
    await preencherAteTaxa();

    expect(screen.getByText("Buscando endereço…")).toBeInTheDocument();

    await assentar(9000);

    expect(screen.queryByText("Buscando endereço…")).toBeNull();
    // E o CEP não fica marcado como resolvido: redigitar tenta de novo.
    expect(campo("Bairro")).toHaveValue("");
  });
});
