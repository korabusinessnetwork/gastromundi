// Notas de atualização do sistema, publicadas em kora.codes/patchnotes.
//
// Regra do dono (2026-11-26): toda atualização entregue entra aqui, na mesma
// rodada. A mais nova vai em cima. Escreva para quem usa o sistema no
// restaurante: o que mudou para ele, em português do dia a dia, sem nome de
// arquivo nem termo técnico. Mudança só por dentro, sem efeito na tela, entra
// como "Por dentro", em uma linha.
//
// tipo de cada item: "novo" (algo que não existia), "corrigido" (algo que
// estava errado) ou "melhoria" (algo que existia e ficou melhor).

export const TIPOS_DE_NOTA = {
  novo: "Novo",
  melhoria: "Melhoria",
  corrigido: "Corrigido",
  interno: "Por dentro",
};

export const NOTAS_DE_ATUALIZACAO = [
  {
    data: "2026-11-26",
    titulo: "Cores do seu estabelecimento em todo lugar e datas no dia certo",
    itens: [
      { tipo: "novo", texto: "Página de novidades do sistema, em kora.codes/patchnotes, com tudo o que muda a cada atualização. O link fica no rodapé do site." },
      { tipo: "corrigido", texto: "A data da compra, na Área Admin, aparecia um dia antes do escolhido. Agora mostra o dia certo." },
      { tipo: "corrigido", texto: "O vencimento do fiado, no detalhe do cliente, também aparecia um dia antes. Corrigido." },
      { tipo: "melhoria", texto: "A prévia do cupom em Configurações, Impressão, e a impressão pelo navegador usam as cores do seu estabelecimento." },
      { tipo: "melhoria", texto: "O aviso \"sem valor fiscal\" do cupom e a barra de força da senha seguem as cores do seu estabelecimento." },
      { tipo: "interno", texto: "Organização do sistema por assunto (nota fiscal, delivery, estoque, caixa, PDV, clientes e outros), sem mudança nas telas." },
    ],
  },
  {
    data: "2026-11-25",
    titulo: "Sistema sem emoji, com ícones na cor do seu estabelecimento",
    itens: [
      { tipo: "melhoria", texto: "Os emojis saíram das telas, dos avisos e do cupom. No lugar entram ícones que seguem as cores do seu estabelecimento e aparecem iguais em qualquer aparelho." },
      { tipo: "corrigido", texto: "A observação do item no cupom saía como um quadrado na impressora térmica. Agora sai como \"Obs.:\"." },
      { tipo: "melhoria", texto: "A planilha de produtos não tem mais a coluna de emoji. Planilhas antigas continuam sendo aceitas, e a coluna é ignorada." },
    ],
  },
];

/**
 * Data da nota ("AAAA-MM-DD") por extenso, sem passar pelo fuso horário:
 * `new Date("AAAA-MM-DD")` é meia-noite UTC, que no Brasil ainda é o dia
 * anterior.
 *
 * @param {string} dia - "AAAA-MM-DD"
 * @returns {string} ex.: "26 de novembro de 2026"
 */
export function dataPorExtenso(dia) {
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [ano, mes, d] = String(dia ?? "").split("-").map(Number);
  if (!ano || !mes || !d || mes > 12) return "";
  return `${d} de ${MESES[mes - 1]} de ${ano}`;
}
