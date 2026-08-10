// @vitest-environment jsdom
//
// R7L8 — a plataforma não tinha onde registrar quanto cobra.
//
// `assinaturas.valor_mensal` nasce em 0 (20260719 e, desde a 20260908, para
// TODO estabelecimento provisionado) e nenhum caminho do sistema escrevia esse
// campo. A própria 20260908 dizia, no corpo, que "o preço é combinado depois,
// na tela do Console" — e essa tela não existia. Consequência: o cartão
// "Receita mensal" do Console mostrava R$ 0,00 com clientes pagantes na base,
// e o único jeito de registrar um preço era um UPDATE cru no SQL Editor.
//
// Esta tela é a via de escrita. O que ela precisa garantir, além de salvar:
// que o número gravado seja o número que a pessoa quis (o eco em reais antes
// do clique), que R$ 0 continue sendo uma escolha VÁLIDA (cortesia/piloto) e
// que uma recusa do banco nunca apareça como sucesso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `valorDigitado` (o parser de dinheiro) e `MENSALIDADE_MAXIMA` ficam REAIS —
// são a regra sob teste. Só a escrita no banco é dublada.
const { mockDefinir } = vi.hoisted(() => ({ mockDefinir: vi.fn() }));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return { ...real, definirMensalidade: mockDefinir };
});

import DefinirMensalidadeModal from "./DefinirMensalidadeModal";
import { MENSALIDADE_MAXIMA } from "@/lib/console/console";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";

const SEM_PRECO = { tenantId: "t-novo", nome: "Bar do Zé", valorMensal: 0, status: "ativo" };
const COM_PRECO = { tenantId: "t-pago", nome: "Café Central", valorMensal: 300, status: "ativo" };

const campo = () => screen.getByRole("textbox");
const salvar = () => screen.getByRole("button", { name: /Salvar mensalidade/i });
// Durante o envio o rótulo do botão vira "Salvando…" — buscar só por
// "Salvar mensalidade" não o encontraria mais.
const salvarOuSalvando = () => screen.getByRole("button", { name: /Salvar mensalidade|Salvando/i });
const cancelar = () => screen.getByRole("button", { name: /^Cancelar$/i });

// `formatarReais` usa espaço NÃO-QUEBRÁVEL depois do "R$", e o
// `toHaveTextContent` normaliza espaços — então o valor esperado entra na
// regex com `\s*` no lugar de qualquer espaço, e `$`/`.` escapados.
function comoRegex(reais) {
  return reais.replace(/[$.]/g, "\\$&").replace(/\s/g, "\\s*");
}

function montar(linha = SEM_PRECO) {
  const onFechar = vi.fn();
  const onDefinido = vi.fn();
  render(<DefinirMensalidadeModal linha={linha} onFechar={onFechar} onDefinido={onDefinido} />);
  return { onFechar, onDefinido };
}

describe("DefinirMensalidadeModal — o preço da plataforma", () => {
  beforeEach(() => {
    mockDefinir.mockReset();
    mockDefinir.mockResolvedValue({ data: { tenant_id: "t-novo", valor_mensal: 300 }, error: null });
  });

  it("diz de quem é o preço e por que o zero importa", () => {
    montar();
    expect(screen.getByText("Bar do Zé")).toBeInTheDocument();
    // Sem isto a pessoa não liga o "—" da tabela à receita mensal zerada.
    expect(
      screen.getByText(/ainda não tem mensalidade definida.*não entra na receita mensal/i)
    ).toBeInTheDocument();
    expect(salvar()).toBeDisabled(); // campo vazio não salva
  });

  it("já vem preenchido com o valor de hoje, no formato de quem digita", () => {
    // Vem preenchido para EDITAR (mudar 300 para 350), não redigitar. E com
    // vírgula, do jeito que o teclado brasileiro escreve — "300.5" na tela
    // seria o sistema falando a língua do banco, não a do usuário.
    montar({ ...COM_PRECO, valorMensal: 300.5 });
    expect(campo()).toHaveValue("300,5");
    expect(screen.getByText(/Hoje este estabelecimento paga R\$\s*300,50 por mês/)).toBeInTheDocument();
  });

  it("ECOA em reais o valor entendido antes de salvar", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), "300,00");
    // O eco é a prevenção de erro desta tela: é aqui que "30000" (vírgula
    // esquecida) salta aos olhos ANTES de virar mensalidade de R$ 30.000.
    expect(screen.getByText(/Vai ficar R\$\s*300,00 por mês\./)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it("salva o NÚMERO, não o texto digitado", async () => {
    const user = userEvent.setup();
    const { onDefinido } = montar();
    await user.type(campo(), "1.250,50"); // com separador de milhar, como se escreve
    expect(screen.getByText(/Vai ficar R\$\s*1\.250,50 por mês\./)).toBeInTheDocument();
    await user.click(salvar());
    // Mandar "1.250,50" faria o Postgres recusar (ou pior, gravar 1.25).
    expect(mockDefinir).toHaveBeenCalledWith("t-novo", 1250.5);
    expect(onDefinido).toHaveBeenCalledWith({ tenant_id: "t-novo", valor_mensal: 300 });
  });

  it("zerar quem paga é escolha válida (cortesia) e diz o que significa", async () => {
    const user = userEvent.setup();
    montar(COM_PRECO);
    await user.clear(campo());
    await user.type(campo(), "0");
    // Um guard ingênuo (`if (!valor) return`) transformaria cortesia em
    // "campo obrigatório" e a tela ofereceria algo que não dá para fazer.
    expect(screen.getByText(/Vai ficar sem mensalidade \(cortesia\)/i)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
    await user.click(salvar());
    expect(mockDefinir).toHaveBeenCalledWith("t-pago", 0);
  });

  it("digitar 0 em quem já está sem preço explica o botão travado", async () => {
    // Beco sem saída que existia aqui: a tela convida a clicar no "—" âmbar,
    // oferece a cortesia como desfecho e o "Salvar" nunca liga (0 sobre 0 não
    // é mudança nenhuma) — sem UMA palavra na tela dizendo por quê.
    const user = userEvent.setup();
    montar(SEM_PRECO);
    await user.type(campo(), "0");
    expect(
      screen.getByText(/já está sem mensalidade\. Digite um valor para começar a cobrar/i)
    ).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
    expect(mockDefinir).not.toHaveBeenCalled();
  });

  it("texto que não é número é recusado antes de chegar ao banco", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), "trezentos");
    expect(screen.getByRole("alert")).toHaveTextContent(/Digite só números/i);
    expect(salvar()).toBeDisabled();
    await user.click(salvar());
    expect(mockDefinir).not.toHaveBeenCalled();
  });

  it("negativo é recusado (viraria receita negativa no cartão da plataforma)", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), "-50");
    expect(screen.getByRole("alert")).toHaveTextContent(/não pode ser negativa/i);
    expect(salvar()).toBeDisabled();
  });

  it("acima do teto é recusado dizendo qual é o teto", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), "100000,01");
    // A recusa nomeia o limite: descobrir o teto pelo erro cru do Postgres
    // seria jargão técnico na tela (Princípio nº1).
    expect(screen.getByRole("alert")).toHaveTextContent(
      new RegExp(`máximo aceito é ${comoRegex(formatarReais(MENSALIDADE_MAXIMA))} por mês`)
    );
    expect(salvar()).toBeDisabled();
    expect(mockDefinir).not.toHaveBeenCalled();
  });

  it("o teto EXATO passa (o limite não pode barrar valor legítimo)", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), "100000");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(salvar()).toBeEnabled();
  });

  it("não deixa salvar o valor que já está gravado", async () => {
    // Escrita sem mudança é chamada inútil na RPC e um "salvo!" que não
    // salvou nada. O botão fica travado até o número mudar de verdade.
    const user = userEvent.setup();
    montar(COM_PRECO);
    expect(campo()).toHaveValue("300");
    expect(salvar()).toBeDisabled();
    // E o motivo fica escrito: botão travado sem explicação é beco sem saída.
    expect(screen.getByText(/Já é esse o valor de hoje/i)).toBeInTheDocument();
    await user.clear(campo());
    await user.type(campo(), "350");
    expect(salvar()).toBeEnabled();
  });

  it("clique duplo manda uma vez só", async () => {
    const user = userEvent.setup();
    let liberar;
    mockDefinir.mockImplementation(() => new Promise((r) => { liberar = r; }));
    montar();
    await user.type(campo(), "300");
    await user.click(salvar());

    expect(screen.getByText(/Salvando…/)).toBeInTheDocument();
    expect(salvarOuSalvando()).toBeDisabled();
    expect(cancelar()).toBeDisabled();       // fechar no meio da escrita
    expect(campo()).toBeDisabled();          // e mudar o valor no meio dela
    await user.click(salvarOuSalvando());
    expect(mockDefinir).toHaveBeenCalledTimes(1);

    await act(async () => { liberar({ data: { valor_mensal: 300 }, error: null }); });
    expect(mockDefinir).toHaveBeenCalledTimes(1);
  });

  it("recusa do banco aparece na tela e o modal NÃO fecha", async () => {
    const user = userEvent.setup();
    mockDefinir.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Apenas a plataforma pode definir a mensalidade de um estabelecimento." },
    });
    const { onDefinido, onFechar } = montar();
    await user.type(campo(), "300");
    await user.click(salvar());

    // Fechar aqui seria o pior desfecho possível: a pessoa sai achando que
    // gravou o preço e o cartão de receita continua mentindo.
    expect(screen.getByRole("alert")).toHaveTextContent(/Apenas a plataforma pode definir/i);
    expect(onDefinido).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    // E dá para tentar de novo: nada fica travado depois da falha.
    expect(salvar()).toBeEnabled();
    expect(campo()).toBeEnabled();
  });

  it("Cancelar fecha sem escrever nada", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();
    await user.type(campo(), "300");
    await user.click(cancelar());
    expect(onFechar).toHaveBeenCalled();
    expect(mockDefinir).not.toHaveBeenCalled();
  });
});
