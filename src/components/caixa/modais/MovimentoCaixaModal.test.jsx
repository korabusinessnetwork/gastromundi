// @vitest-environment jsdom
//
// F005 — sangria e suprimento.
//
// O que este arquivo protege: o caminho onde dinheiro sai fisicamente da
// gaveta. Três coisas não podem regredir aqui.
//
//   1. O botão só habilita com o formulário válido, e o motivo do bloqueio
//      fica escrito na tela (Princípio nº 1: prevenir, não avisar depois).
//   2. Sangria acima do limite do estabelecimento não passa sem um gerente
//      autorizar de verdade — senha conferida antes do insert, nunca depois.
//   3. Falha na gravação MANTÉM o modal aberto. Se ele fechasse, o operador
//      levaria o dinheiro ao cofre achando que registrou, e a gaveta e o
//      sistema se separariam em silêncio até o fechamento acusar falta.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

vi.mock("@/lib/console/adminAuth", () => ({
  verificarSenhaUsuario: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));

import { verificarSenhaUsuario } from "@/lib/console/adminAuth";
import MovimentoCaixaModal from "./MovimentoCaixaModal";

const campoValor  = () => document.querySelector(".movimento-caixa__input");
const campoMotivo = () => document.querySelector(".movimento-caixa__textarea");
const campoSenha  = () => document.querySelector(".movimento-caixa__senha");
const seletorGerente = () => document.querySelector(".movimento-caixa__select");
const botao     = () => document.querySelector(".movimento-caixa__botao-confirmar");
const pendencia = () => document.querySelector(".movimento-caixa__pendencia");
const erro      = () => document.querySelector(".movimento-caixa__erro");
const botoesTipo = () => [...document.querySelectorAll(".movimento-caixa__tipo")];

const GERENTES = [{ username: "ana", name: "Ana", role: "gerente" }];

function montar(props = {}) {
  const onConfirm = props.onConfirm ?? vi.fn(() => Promise.resolve({ error: null }));
  const onClose   = props.onClose   ?? vi.fn();
  const utils = render(
    <MovimentoCaixaModal
      disponivel={500}
      limite={200}
      autorizadores={GERENTES}
      podeAutorizarSozinho={false}
      {...props}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  return { ...utils, onConfirm, onClose };
}

/** Preenche o formulário como o operador faria. */
function preencher({ valor, motivo, tipo }) {
  if (tipo === "suprimento") fireEvent.click(botoesTipo()[1]);
  if (valor !== undefined)  fireEvent.change(campoValor(),  { target: { value: String(valor) } });
  if (motivo !== undefined) fireEvent.change(campoMotivo(), { target: { value: motivo } });
}

beforeEach(() => {
  verificarSenhaUsuario.mockReset();
  verificarSenhaUsuario.mockResolvedValue({ ok: true, erro: null });
});

describe("MovimentoCaixaModal — o botão diz por que não dá para confirmar", () => {
  it("abre bloqueado, explicando que falta o valor", () => {
    montar();
    expect(botao()).toBeDisabled();
    expect(pendencia().textContent).toContain("Digite quanto está saindo");
  });

  it("valor sem motivo continua bloqueado — o motivo é o que a conferência lê", () => {
    montar();
    preencher({ valor: "50" });

    expect(botao()).toBeDisabled();
    expect(pendencia().textContent).toContain("Escreva o motivo");
  });

  it("sangria acima do dinheiro na gaveta é bloqueada, com o valor disponível na mensagem", () => {
    montar({ disponivel: 80 });
    preencher({ valor: "100", motivo: "cofre" });

    expect(botao()).toBeDisabled();
    expect(pendencia().textContent).toContain("80,00");
  });

  it("sangria exatamente igual ao disponível passa — deixar a gaveta em zero é legítimo", () => {
    montar({ disponivel: 80 });
    preencher({ valor: "80", motivo: "levado ao cofre" });

    expect(botao()).not.toBeDisabled();
  });

  it("gaveta vazia bloqueia sangria mas não bloqueia suprimento", () => {
    montar({ disponivel: 0 });
    preencher({ valor: "50", motivo: "reforço de troco" });
    expect(botao()).toBeDisabled();
    expect(pendencia().textContent).toContain("Não há dinheiro na gaveta");

    fireEvent.click(botoesTipo()[1]);
    expect(botao()).not.toBeDisabled();
  });
});

describe("MovimentoCaixaModal — autorização acima do limite", () => {
  it("sangria acima do limite pede um gerente antes de liberar o botão", () => {
    montar({ limite: 200 });
    preencher({ valor: "300", motivo: "levado ao cofre" });

    expect(campoSenha()).toBeTruthy();
    expect(botao()).toBeDisabled();
    expect(pendencia().textContent).toContain("Peça ao gerente");
  });

  it("suprimento acima do limite não pede senha — pôr dinheiro na gaveta não é risco", () => {
    montar({ limite: 200 });
    preencher({ tipo: "suprimento", valor: "300", motivo: "reforço de troco" });

    expect(campoSenha()).toBeNull();
    expect(botao()).not.toBeDisabled();
  });

  it("admin/gerente autoriza a si mesmo, sem digitar a própria senha", async () => {
    const { onConfirm } = montar({ limite: 200, podeAutorizarSozinho: true });
    preencher({ valor: "300", motivo: "levado ao cofre" });

    expect(campoSenha()).toBeNull();
    await act(async () => { fireEvent.click(botao()); });

    expect(verificarSenhaUsuario).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ autorizadoPor: null }));
  });

  it("senha errada não registra nada e mostra o erro no lugar da senha", async () => {
    verificarSenhaUsuario.mockResolvedValue({ ok: false, erro: null });
    const { onConfirm, onClose } = montar({ limite: 200 });
    preencher({ valor: "300", motivo: "levado ao cofre" });
    fireEvent.change(campoSenha(), { target: { value: "errada" } });

    await act(async () => { fireEvent.click(botao()); });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(erro().textContent).toContain("Senha incorreta");
    // E o botão volta a aceitar clique: "tente de novo" precisa ser seguível.
    expect(botao()).not.toBeDisabled();
  });

  it("senha certa grava quem autorizou, pelo username", async () => {
    const { onConfirm, onClose } = montar({ limite: 200 });
    preencher({ valor: "300", motivo: "levado ao cofre" });
    fireEvent.change(campoSenha(), { target: { value: "certa" } });

    await act(async () => { fireEvent.click(botao()); });

    expect(verificarSenhaUsuario).toHaveBeenCalledWith("ana", "certa");
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "sangria", valor: 300, motivo: "levado ao cofre", autorizadoPor: "ana",
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it("o gerente escolhido no seletor é o que vai para a conferência da senha", async () => {
    const { onConfirm } = montar({
      limite: 200,
      autorizadores: [...GERENTES, { username: "bruno", name: "Bruno", role: "admin" }],
    });
    preencher({ valor: "300", motivo: "levado ao cofre" });
    fireEvent.change(seletorGerente(), { target: { value: "bruno" } });
    fireEvent.change(campoSenha(), { target: { value: "certa" } });

    await act(async () => { fireEvent.click(botao()); });

    expect(verificarSenhaUsuario).toHaveBeenCalledWith("bruno", "certa");
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ autorizadoPor: "bruno" }));
  });

  it("limite mal configurado cai no padrão em vez de liberar sangria ilimitada", () => {
    montar({ limite: 0 });
    preencher({ valor: "250", motivo: "levado ao cofre" });

    // Sem o padrão, limite 0 faria `exigeAutorizacao` comparar contra zero de
    // um jeito ou outro — o risco é o lado que LIBERA. 250 > 200 pede senha.
    expect(campoSenha()).toBeTruthy();
  });
});

describe("MovimentoCaixaModal — gravação", () => {
  it("abaixo do limite registra direto, sem autorizador", async () => {
    const { onConfirm, onClose } = montar({ limite: 200 });
    preencher({ valor: "50.50", motivo: "  levado ao cofre  " });

    await act(async () => { fireEvent.click(botao()); });

    expect(verificarSenhaUsuario).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith({
      tipo: "sangria",
      valor: 50.5,
      motivo: "levado ao cofre",
      autorizadoPor: null,
      disponivel: 500,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("erro na gravação mantém o modal aberto e diz o que aconteceu", async () => {
    const onConfirm = vi.fn(() => Promise.resolve({ error: { message: "Sem permissão para registrar." } }));
    const { onClose } = montar({ onConfirm });
    preencher({ valor: "50", motivo: "levado ao cofre" });

    await act(async () => { fireEvent.click(botao()); });

    expect(onClose).not.toHaveBeenCalled();
    expect(erro().textContent).toContain("Sem permissão");
    expect(erro().getAttribute("role")).toBe("alert");
    // Botão liberado: sem isso, o "tente novamente" não teria como ser feito.
    expect(botao()).not.toBeDisabled();
  });

  it("clique duplo não registra a mesma sangria duas vezes", async () => {
    let liberar;
    const onConfirm = vi.fn(() => new Promise(resolve => { liberar = resolve; }));
    montar({ onConfirm });
    preencher({ valor: "50", motivo: "levado ao cofre" });

    fireEvent.click(botao());
    fireEvent.click(botao());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(botao()).toBeDisabled();
    await act(async () => { liberar({ error: null }); });
  });

  it("trocar de tipo limpa o erro anterior — a tela não mistura duas tentativas", async () => {
    const onConfirm = vi.fn(() => Promise.resolve({ error: { message: "Falhou." } }));
    montar({ onConfirm });
    preencher({ valor: "50", motivo: "levado ao cofre" });
    await act(async () => { fireEvent.click(botao()); });
    expect(erro()).toBeTruthy();

    fireEvent.click(botoesTipo()[1]);
    expect(erro()).toBeNull();
  });
});
