// @vitest-environment jsdom
//
// CONSOLE-UX 12 — a mensalidade combinada entra no cadastro.
//
// `provisionar_tenant` (20260908) cria a assinatura com `valor_mensal = 0`, e
// até esta rodada lembrar de definir o preço em outra aba era com o dono. O
// resultado prático era cliente vendido valendo R$ 0,00 na base e "Receita
// mensal" mentindo. O que estes testes protegem: que o preço combinado seja
// perguntado onde a venda acontece, que o número gravado seja o número que a
// pessoa quis, e que uma falha só do preço nunca vire "a criação falhou".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `validarNovoEstabelecimento`, `valorDigitado` e `MENSALIDADE_MAXIMA` ficam
// REAIS — são a regra sob teste. Só as duas escritas são dubladas.
const { mockProvisionar, mockDefinir } = vi.hoisted(() => ({
  mockProvisionar: vi.fn(),
  mockDefinir: vi.fn(),
}));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, provisionarEstabelecimento: mockProvisionar, definirMensalidade: mockDefinir };
});

import NovoEstabelecimentoModal from "./NovoEstabelecimentoModal";
import { MENSALIDADE_MAXIMA } from "@/lib/console";
import { formatarReais } from "@/lib/deliveryPedidos";

const PLANOS = [
  { codigo: "basico", nome: "Básico" },
  { codigo: "avancado", nome: "Avançado" },
];

// `formatarReais` usa espaço NÃO-QUEBRÁVEL depois do "R$", e o matcher de
// texto normaliza espaços — daí a regex com `\s*`.
function comoRegex(reais) {
  return reais.replace(/[$.]/g, "\\$&").replace(/\s/g, "\\s*");
}

const mensalidade = () => screen.getByLabelText(/Mensalidade combinada/i);
const criar = () => screen.getByRole("button", { name: /Criar estabelecimento|Criando/i });

function montar(slugsEmUso = []) {
  const user = userEvent.setup();
  const onCriado = vi.fn();
  const onFechar = vi.fn();
  render(
    <NovoEstabelecimentoModal
      planos={PLANOS}
      slugsEmUso={slugsEmUso}
      onFechar={onFechar}
      onCriado={onCriado}
    />
  );
  return { user, onCriado, onFechar };
}

const linkDoCardapio = () => screen.getByLabelText(/Link do cardápio/i);

// Escolhe um usuário de acesso à mão. Desde a CONSOLE-UX 22 o campo já vem
// preenchido a partir do nome do responsável, então digitar sem limpar antes
// concatenaria com a sugestão.
async function digitarUsuario(user, valor) {
  const campo = screen.getByLabelText(/Usuário de acesso/i);
  await user.clear(campo);
  await user.type(campo, valor);
}

// Preenche tudo o que a validação real exige, menos a mensalidade.
async function preencher(user, nome = "Bar do Zé") {
  await user.type(screen.getByLabelText(/Nome do estabelecimento/i), nome);
  await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
  await digitarUsuario(user, "barze");
  await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
}

describe("NovoEstabelecimentoModal — a mensalidade combinada", () => {
  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    mockDefinir.mockResolvedValue({ data: { tenant_id: "t-novo", valor_mensal: 300 }, error: null });
  });

  it("ecoa em reais o valor entendido antes de salvar", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "300,00");
    expect(screen.getByText(new RegExp(`Vai ficar ${comoRegex(formatarReais(300))} por mês`))).toBeInTheDocument();
  });

  it("vírgula e ponto não viram valor errado — o eco mostra o que será gravado", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "1.200,50");
    expect(screen.getByText(new RegExp(comoRegex(formatarReais(1200.5))))).toBeInTheDocument();
  });

  it("valor inválido explica em português e trava o botão", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "trezentos");
    expect(screen.getByText(/Digite só números, com vírgula nos centavos/i)).toBeInTheDocument();
    expect(criar()).toBeDisabled();
  });

  it("acima do teto é recusado antes de sair da tela", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "100000,01");
    expect(
      screen.getByText(new RegExp(`O máximo aceito é ${comoRegex(formatarReais(MENSALIDADE_MAXIMA))}`))
    ).toBeInTheDocument();
    expect(criar()).toBeDisabled();
    await user.clear(mensalidade());
    await user.type(mensalidade(), "100000");
    expect(criar()).toBeEnabled();
  });

  it("vazio é caminho legítimo: cria sem preço e diz onde defini-lo depois", async () => {
    const { user, onCriado } = montar();
    expect(screen.getByText(/define depois em "Planos e assinaturas"/i)).toBeInTheDocument();

    await preencher(user);
    await user.click(criar());

    expect(mockProvisionar).toHaveBeenCalledTimes(1);
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ mensalidade: null, mensalidadeFalhou: false })
    );
  });

  it("zero digitado é o mesmo que vazio — não chama a RPC à toa", async () => {
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "0");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).toHaveBeenCalledWith(expect.objectContaining({ mensalidade: null }));
  });

  it("com valor, grava o preço pela RPC logo depois de criar o estabelecimento", async () => {
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300,00");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).toHaveBeenCalledWith("t-novo", 300);
    expect(mockProvisionar.mock.invocationCallOrder[0]).toBeLessThan(
      mockDefinir.mock.invocationCallOrder[0]
    );
    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t-novo", plano_codigo: "avancado", mensalidade: 300, mensalidadeFalhou: false })
    );
  });

  it("preço que falha não apaga o estabelecimento nem mente que a criação falhou", async () => {
    mockDefinir.mockResolvedValue({ data: null, error: { message: "permissao negada" } });
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300");
    await preencher(user);
    await user.click(criar());

    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t-novo", mensalidade: null, mensalidadeFalhou: true })
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("provisionamento que falha nem chega a mexer no preço", async () => {
    mockProvisionar.mockResolvedValue({ data: null, error: { message: "usuario ja existe" } });
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).not.toHaveBeenCalled();
    expect(criar()).toBeEnabled();
  });
});

// CONSOLE-UX 19 — o endereço (slug) é escolhido na criação.
//
// Antes desta rodada o Console nunca mandava `slug`: o banco derivava do nome
// e, em colisão ou rótulo reservado, renomeava CALADO (bardoze → bardoze2,
// console → console2). O dono só descobria o endereço depois de criado, e
// nunca sabia que tinha sido renomeado. O que estes testes protegem: que o
// endereço apareça antes de criar, que seja exatamente o que o banco vai
// gravar, e que conflito vire uma escolha em vez de uma surpresa.
describe("NovoEstabelecimentoModal — o endereço do cardápio", () => {
  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    mockDefinir.mockResolvedValue({ data: null, error: null });
  });

  it("nasce do nome, já no formato que o banco guarda", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    expect(linkDoCardapio()).toHaveValue("bardoze");
  });

  it("mostra o link inteiro que o cliente vai receber", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    expect(screen.getByText("/cardapio?loja=bardoze")).toBeInTheDocument();
  });

  it("normaliza o que se digita no campo — hífen e acento somem na hora", async () => {
    const { user } = montar();
    await user.type(linkDoCardapio(), "Bar-Do Zé!");
    expect(linkDoCardapio()).toHaveValue("bardoze");
  });

  it("depois de editado, o endereço para de seguir o nome", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.clear(linkDoCardapio());
    await user.type(linkDoCardapio(), "barzinho");
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), " e Cia");
    expect(linkDoCardapio()).toHaveValue("barzinho");
  });

  it("endereço já ocupado trava o envio e diz qual está livre", async () => {
    const { user } = montar(["bardoze"]);
    await preencher(user);
    await user.click(criar());

    expect(mockProvisionar).not.toHaveBeenCalled();
    expect(screen.getByText(/Já existe um estabelecimento neste endereço/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Usar bardoze2/i })).toBeInTheDocument();
  });

  it("um clique na sugestão resolve o conflito e o envio segue", async () => {
    const { user } = montar(["bardoze"]);
    await preencher(user);
    await user.click(criar());
    await user.click(screen.getByRole("button", { name: /Usar bardoze2/i }));

    expect(linkDoCardapio()).toHaveValue("bardoze2");
    await user.click(criar());
    expect(mockProvisionar).toHaveBeenCalledWith(expect.objectContaining({ slug: "bardoze2" }));
  });

  it("endereço reservado pelo sistema é barrado antes de virar console2", async () => {
    const { user } = montar();
    await preencher(user, "Console");
    await user.click(criar());

    expect(mockProvisionar).not.toHaveBeenCalled();
    expect(screen.getByText(/reservado pelo sistema/i)).toBeInTheDocument();
  });

  it("nome sem letra nem número pede o endereço em vez de deixar o banco chutar", async () => {
    const { user } = montar();
    await preencher(user, "@@@");
    await user.click(criar());

    expect(mockProvisionar).not.toHaveBeenCalled();
    expect(screen.getByText(/Informe o endereço do cardápio/i)).toBeInTheDocument();
  });

  it("o endereço escolhido vai junto no provisionamento", async () => {
    const { user } = montar();
    await preencher(user);
    await user.click(criar());
    expect(mockProvisionar).toHaveBeenCalledWith(expect.objectContaining({ slug: "bardoze" }));
  });
});

// CONSOLE-UX 20 — a senha provisória do responsável.
//
// O dono inventava, no meio da venda, a senha do usuário mais poderoso do
// estabelecimento do cliente; a única regra era o mínimo de 6 caracteres, e
// nada impedia "123456" em todo cliente novo. O que estes testes protegem: que
// exista uma senha boa a um clique, que a senha fraca seja dita em voz alta —
// e que o aviso continue sendo aviso, sem travar quem já decidiu.
describe("NovoEstabelecimentoModal — a senha provisória", () => {
  const senhaProvisoria = () => screen.getByLabelText(/Senha provisória/i);
  const gerarSenha = () => screen.getByRole("button", { name: /Gerar senha/i });

  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    mockDefinir.mockResolvedValue({ data: null, error: null });
  });

  it("um clique preenche o campo com uma senha forte, visível na tela", async () => {
    const { user } = montar();
    await user.click(gerarSenha());

    const campo = senhaProvisoria();
    expect(campo).toHaveAttribute("type", "text");
    expect(campo.value).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
    expect(screen.getByText(/Senha forte/i)).toBeInTheDocument();
  });

  it("gerar de novo troca a senha", async () => {
    const { user } = montar();
    await user.click(gerarSenha());
    const primeira = senhaProvisoria().value;
    await user.click(gerarSenha());
    expect(senhaProvisoria().value).not.toBe(primeira);
  });

  it("gerar limpa o erro que estava no campo", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    await digitarUsuario(user, "barze");
    await user.click(criar());
    expect(screen.getByText(/Defina uma senha para o responsável/i)).toBeInTheDocument();

    await user.click(gerarSenha());
    expect(screen.queryByText(/Defina uma senha para o responsável/i)).not.toBeInTheDocument();
  });

  it("senha óbvia é dita em português, sem jargão", async () => {
    const { user } = montar();
    await user.type(senhaProvisoria(), "123456");
    expect(screen.getByText(/Senha fraca/i)).toBeInTheDocument();
    expect(screen.getByText(/qualquer invasor tenta/i)).toBeInTheDocument();
  });

  it("senha igual ao usuário de acesso é apontada", async () => {
    const { user } = montar();
    await digitarUsuario(user, "bardozegrill");
    await user.type(senhaProvisoria(), "bardozegrill");
    expect(screen.getByText(/igual ao usuário de acesso/i)).toBeInTheDocument();
  });

  it("o aviso reavalia a cada tecla e some quando a senha melhora", async () => {
    const { user } = montar();
    await user.type(senhaProvisoria(), "abc123");
    expect(screen.getByText(/Senha fraca/i)).toBeInTheDocument();
    await user.clear(senhaProvisoria());
    await user.type(senhaProvisoria(), "kx7mrapqz4");
    expect(screen.queryByText(/Senha fraca/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Senha forte/i)).toBeInTheDocument();
  });

  it("o aviso avisa, mas não bloqueia: senha fraca de 6 caracteres ainda cria", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    await digitarUsuario(user, "barze");
    await user.type(senhaProvisoria(), "123456");

    expect(screen.getByText(/Senha fraca/i)).toBeInTheDocument();
    expect(criar()).toBeEnabled();

    await user.click(criar());
    expect(mockProvisionar).toHaveBeenCalledWith(
      expect.objectContaining({ adminPassword: "123456" })
    );
  });

  it("abaixo do mínimo de 6 continua sendo a regra que barra o envio", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    await digitarUsuario(user, "barze");
    await user.type(senhaProvisoria(), "abc");
    await user.click(criar());

    expect(mockProvisionar).not.toHaveBeenCalled();
    expect(screen.getByText(/ao menos 6 caracteres/i)).toBeInTheDocument();
  });

  it("a senha nunca vai parar no log", async () => {
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    await digitarUsuario(user, "barze");
    await user.click(gerarSenha());
    const senha = senhaProvisoria().value;
    await user.click(criar());

    const registrado = espiao.mock.calls.flat().map(String).join(" ");
    expect(registrado).not.toContain(senha);
    espiao.mockRestore();
  });
});

// CONSOLE-UX 21 — sugestão de usuário livre depois da recusa do servidor.
//
// Enquanto o login não é ciente de tenant, o usuário precisa ser único na
// plataforma inteira: o segundo cliente cujo responsável se chama igual bate
// nessa colisão. O que estes testes protegem: que a recusa vire uma escolha de
// um clique, que a sugestão só apareça depois de o servidor recusar, e que ela
// mude a cada nova recusa em vez de repetir o mesmo palpite.
describe("NovoEstabelecimentoModal — sugestão de usuário livre", () => {
  const usuario = () => screen.getByLabelText(/Usuário de acesso/i);
  const sugestao = () => screen.queryByRole("button", { name: /^Usar / });
  const RECUSA = "A user with this email address has already been registered";

  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockDefinir.mockResolvedValue({ data: null, error: null });
  });

  it("oferece o usuário junto do nome da loja quando o servidor recusa", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());

    expect(screen.getByText(/já existe na plataforma/i)).toBeInTheDocument();
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze");
  });

  it("um clique adota a sugestão, limpa o erro e some", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());
    await user.click(sugestao());

    expect(usuario().value).toBe("barze.bardoze");
    expect(screen.queryByText(/já existe na plataforma/i)).not.toBeInTheDocument();
    expect(sugestao()).toBeNull();
  });

  it("a sugestão muda a cada nova recusa, em vez de repetir o palpite", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze");

    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze2");

    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze3");
  });

  it("editar o usuário à mão zera a contagem e volta à sugestão nº 1", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());
    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze2");

    await user.clear(usuario());
    await user.type(usuario(), "maria");
    expect(sugestao()).toBeNull();

    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar maria.bardoze");
  });

  it("não sugere nada antes do primeiro envio nem por erro de validação", async () => {
    const { user } = montar();
    expect(sugestao()).toBeNull();

    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.click(criar());
    expect(screen.getByText(/Informe o usuário de acesso do responsável/i)).toBeInTheDocument();
    expect(sugestao()).toBeNull();
    expect(mockProvisionar).not.toHaveBeenCalled();
  });

  it("não sugere quando a recusa do servidor é de outra coisa", async () => {
    mockProvisionar.mockResolvedValue({ error: "Falha de rede ao falar com o servidor" });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());

    expect(screen.getByText(/Falha de rede/i)).toBeInTheDocument();
    expect(sugestao()).toBeNull();
  });

  it("o aviso de estabelecimento órfão continua inteiro ao lado da sugestão", async () => {
    mockProvisionar.mockResolvedValue({
      error: `${RECUSA} ATENÇÃO: o estabelecimento ficou criado sem responsável — apague pelo painel.`,
    });
    const { user } = montar();
    await preencher(user);
    await user.click(criar());

    expect(screen.getByText(/ficou criado sem responsável/i)).toBeInTheDocument();
    expect(sugestao()).toHaveTextContent("Usar barze.bardoze");
  });

  it("adotar a sugestão deixa o cadastro pronto para reenviar e criar", async () => {
    mockProvisionar.mockResolvedValueOnce({ error: RECUSA });
    mockProvisionar.mockResolvedValueOnce({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze.bardoze" } },
      error: null,
    });
    const { user, onCriado } = montar();
    await preencher(user);
    await user.click(criar());
    await user.click(sugestao());
    await user.click(criar());

    expect(mockProvisionar).toHaveBeenLastCalledWith(
      expect.objectContaining({ adminUsername: "barze.bardoze" })
    );
    expect(onCriado).toHaveBeenCalledTimes(1);
  });
});

// CONSOLE-UX 22 — o usuário de acesso nasce do nome do responsável.
//
// Era o último campo que o dono tinha de inventar do zero no meio da venda:
// digitava "José Maria" e o campo vizinho ficava vazio, esperando que ele
// traduzisse aquilo para `josemaria` de cabeça. O que estes testes protegem: a
// derivação por estado derivado (muda junto com o nome, sem atraso), e o
// momento em que ela precisa parar — mão do dono no campo manda mais.
describe("NovoEstabelecimentoModal — o usuário de acesso vem do responsável", () => {
  const usuario = () => screen.getByLabelText(/Usuário de acesso/i);
  const responsavel = () => screen.getByLabelText(/Nome do responsável/i);
  const sugestao = () => screen.queryByRole("button", { name: /^Usar / });
  const RECUSA = "A user with this email address has already been registered";

  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockDefinir.mockResolvedValue({ data: null, error: null });
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-1", nome: "Bar do Zé", admin: { username: "josemaria" } },
      error: null,
    });
  });

  it("o campo segue o nome do responsável, já normalizado", async () => {
    const { user } = montar();
    expect(usuario().value).toBe("");

    await user.type(responsavel(), "José Maria");
    expect(usuario().value).toBe("josemaria");

    await user.clear(responsavel());
    await user.type(responsavel(), "Ana Paula");
    expect(usuario().value).toBe("anapaula");
  });

  it("a dica avisa que o usuário foi sugerido e pode ser trocado", async () => {
    const { user } = montar();
    await user.type(responsavel(), "José Maria");
    expect(screen.getByText(/Sugerido a partir do responsável/i)).toBeInTheDocument();

    await digitarUsuario(user, "jose");
    expect(screen.queryByText(/Sugerido a partir do responsável/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Só letras minúsculas/i)).toBeInTheDocument();
  });

  it("nome curto demais deixa o campo vazio, em vez de sugerir algo recusável", async () => {
    const { user } = montar();
    await user.type(responsavel(), "Zé");
    expect(usuario().value).toBe("");

    await user.click(criar());
    expect(screen.getByText(/Informe o usuário de acesso do responsável/i)).toBeInTheDocument();
    expect(mockProvisionar).not.toHaveBeenCalled();
  });

  it("depois de editado à mão, o campo para de seguir o nome — mesmo apagado", async () => {
    const { user } = montar();
    await user.type(responsavel(), "José Maria");
    await digitarUsuario(user, "chefe");
    await user.type(responsavel(), " Silva");
    expect(usuario().value).toBe("chefe");

    await user.clear(usuario());
    await user.type(responsavel(), " Souza");
    expect(usuario().value).toBe("");
  });

  it("aceitar a sugestão de usuário livre também trava a derivação", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(responsavel(), "José Maria");
    await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
    await user.click(criar());
    await user.click(sugestao());
    expect(usuario().value).toBe("josemaria.bardoze");

    // O candidato aceito não pode ser varrido pela próxima letra do nome.
    await user.type(responsavel(), " Silva");
    expect(usuario().value).toBe("josemaria.bardoze");
  });

  it("mudar o nome depois de uma recusa volta à sugestão nº 1 do texto novo", async () => {
    mockProvisionar.mockResolvedValue({ error: RECUSA });
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(responsavel(), "José Maria");
    await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar josemaria.bardoze");

    await user.clear(responsavel());
    await user.type(responsavel(), "Ana Paula");
    await user.click(criar());
    expect(sugestao()).toHaveTextContent("Usar anapaula.bardoze");
  });

  it("o que vai para o servidor é o usuário derivado, sem ninguém digitá-lo", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(responsavel(), "José Maria");
    await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
    await user.click(criar());

    expect(mockProvisionar).toHaveBeenCalledWith(
      expect.objectContaining({ adminNome: "José Maria", adminUsername: "josemaria" })
    );
  });

  it("a força da senha compara com o usuário derivado", async () => {
    const { user } = montar();
    await user.type(responsavel(), "José Maria");
    await user.type(screen.getByLabelText(/Senha provisória/i), "josemaria");
    expect(screen.getByText(/igual ao usuário de acesso/i)).toBeInTheDocument();
  });
});

// ── CONSOLE-UX 23 — confirmar antes de descartar o cadastro pela metade ──
//
// Fechar é a única ação sem volta do modal: some o cadastro inteiro, inclusive
// a senha sorteada, que não é relida de lugar nenhum. O que estes testes
// protegem: que um clique no "X" no meio da venda não apague o trabalho, e que
// o formulário ainda vazio continue fechando num clique só.
describe("NovoEstabelecimentoModal — descartar o cadastro", () => {
  const fechar = () => screen.getByRole("button", { name: /^Fechar$/i });
  const cancelar = () => screen.getByRole("button", { name: /^Cancelar$/i });
  const descartar = () => screen.queryByRole("button", { name: /^Descartar$/i });
  const continuar = () => screen.queryByRole("button", { name: /Continuar preenchendo/i });

  it("formulário vazio fecha na hora, sem perguntar", async () => {
    const { user, onFechar } = montar();
    await user.click(fechar());

    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(descartar()).toBeNull();
  });

  it("o Cancelar do rodapé também fecha na hora quando não há nada", async () => {
    const { user, onFechar } = montar();
    await user.click(cancelar());

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("com dado preenchido, o X pergunta antes e não fecha", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.click(fechar());

    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByText(/Descartar este cadastro\?/i)).toBeInTheDocument();
    expect(descartar()).toBeInTheDocument();
  });

  it("o plano já vem escolhido, então sozinho não faz o modal perguntar", async () => {
    const { user, onFechar } = montar();
    await user.selectOptions(screen.getByLabelText(/^Plano$/i), "basico");
    await user.click(fechar());

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("a senha gerada conta — é o dado que não existe em nenhum outro lugar", async () => {
    const { user, onFechar } = montar();
    await user.click(screen.getByRole("button", { name: /Gerar senha/i }));
    await user.click(fechar());

    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByText(/inclusive a senha do responsável/i)).toBeInTheDocument();
  });

  it("continuar preenchendo devolve o rodapé com os dados intactos", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.click(cancelar());
    await user.click(continuar());

    expect(onFechar).not.toHaveBeenCalled();
    expect(descartar()).toBeNull();
    expect(screen.getByLabelText(/Nome do estabelecimento/i)).toHaveValue("Bar do Zé");
    expect(criar()).toBeInTheDocument();
  });

  it("descartar é o único caminho que fecha de verdade", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.click(fechar());
    await user.click(descartar());

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("enquanto a pergunta está na tela, criar não fica ao lado dela", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.click(fechar());

    expect(screen.queryByRole("button", { name: /Criar estabelecimento/i })).toBeNull();
    expect(continuar()).toBeInTheDocument();
  });

  it("preencher e apagar volta a fechar num clique só", async () => {
    const { user, onFechar } = montar();
    const campo = screen.getByLabelText(/Nome do estabelecimento/i);
    await user.type(campo, "Bar do Zé");
    await user.clear(campo);
    await user.click(fechar());

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("erro do servidor na tela não some sozinho — descartar ali também pergunta", async () => {
    mockProvisionar.mockResolvedValue({ error: "Falha de rede ao falar com o servidor" });
    const { user, onFechar } = montar();
    await preencher(user);
    await user.click(criar());
    expect(await screen.findByText(/Falha de rede/i)).toBeInTheDocument();

    await user.click(fechar());
    expect(onFechar).not.toHaveBeenCalled();
    expect(descartar()).toBeInTheDocument();
  });
});

// ── CONSOLE-UX 24 — Esc e clique fora ──
//
// O gesto que todo mundo tenta primeiro numa janela flutuante. Aqui ele entra
// pelo mesmo caminho do "X": com o formulário vazio fecha na hora, com dado
// preenchido cai na pergunta de descarte da CONSOLE-UX 23. E com a pergunta já
// na tela, Esc equivale a "Continuar preenchendo" — nunca descarta.
describe("NovoEstabelecimentoModal — Esc e clique fora", () => {
  const fundo = () => screen.getByRole("dialog");
  const descartar = () => screen.queryByRole("button", { name: /^Descartar$/i });

  it("com o formulário vazio, Esc fecha na hora", async () => {
    const { user, onFechar } = montar();

    await user.keyboard("{Escape}");

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("com o formulário vazio, o clique no fundo escuro fecha na hora", async () => {
    const { user, onFechar } = montar();

    await user.click(fundo());

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("com dado preenchido, Esc pergunta antes e não fecha", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/^Nome do estabelecimento/i), "Bar do Zé");

    await user.keyboard("{Escape}");

    expect(descartar()).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Nome do estabelecimento/i)).toHaveValue("Bar do Zé");
  });

  it("com dado preenchido, o clique no fundo escuro pergunta antes e não fecha", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/^Nome do estabelecimento/i), "Bar do Zé");

    await user.click(fundo());

    expect(descartar()).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("com a pergunta na tela, Esc volta ao formulário em vez de descartar", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/^Nome do estabelecimento/i), "Bar do Zé");
    await user.keyboard("{Escape}");
    expect(descartar()).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(descartar()).toBeNull();
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Nome do estabelecimento/i)).toHaveValue("Bar do Zé");
    expect(criar()).toBeInTheDocument();
  });

  // Selecionar o texto de um campo e soltar o botão do mouse fora da caixa é
  // um clique que termina no fundo. Se ele fechasse, o dono perderia o
  // cadastro por ter arrastado o mouse enquanto relia o que digitou.
  it("arrastar de dentro para o fundo não pergunta nem fecha", async () => {
    const { user, onFechar } = montar();
    await user.type(screen.getByLabelText(/^Nome do estabelecimento/i), "Bar do Zé");

    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByLabelText(/^Nome do estabelecimento/i) },
      { keys: "[/MouseLeft]", target: fundo() },
    ]);

    expect(descartar()).toBeNull();
    expect(onFechar).not.toHaveBeenCalled();
  });
});

// CONSOLE-UX 25 — o foco. Abrir um modal e ter de caçar o primeiro campo com o
// mouse é o que fazia o cadastro ser lento; e o Tab não pode passear pela
// tabela que ficou por baixo do fundo escuro.
describe("NovoEstabelecimentoModal — foco do teclado", () => {
  it("abre com o cursor no primeiro campo, não no botão de fechar", () => {
    montar();

    expect(screen.getByLabelText(/^Nome do estabelecimento/i)).toHaveFocus();
  });

  it("o Tab não escapa do modal: do último elemento volta para o primeiro", async () => {
    const { user } = montar();

    // O "X" é o primeiro focável da caixa; Shift+Tab nele tem de dar a volta
    // para dentro do modal, nunca cair na página de trás.
    screen.getByRole("button", { name: /Fechar/i }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });
});
