// Mensagem humana para o desfecho da emissão de NFC-e.
//
// A modal do cupom mostrava o `detalhe` cru do resultado — texto de
// desenvolvedor ("Failed to fetch (xxxxx.supabase.co)") na frente do
// consumidor, que além de não ajudar ninguém no balcão ainda expunha o
// endereço interno do banco. Aqui o desfecho vira uma frase que o operador
// entende e sabe o que fazer com ela.
//
// Lógica pura (sem React, sem rede) para nascer testada.

// Endereço de servidor/URL no meio do texto: nunca vai para a tela. Cobre
// "host.dominio.com", "https://host/path" e afins. É defesa em profundidade —
// o `detalhe` só chega à tela quando vem da SEFAZ (motivo de rejeição).
const PADRAO_ENDERECO = /\b(?:[a-z][a-z0-9+.-]*:\/\/\S+|[a-z0-9-]+(?:\.[a-z0-9-]+){1,}(?:\/\S*)?)/gi;

/** Remove endereços de servidor e espaços sobrando de um texto técnico. */
export function limparDetalheTecnico(texto) {
  if (typeof texto !== "string") return "";
  return texto.replace(PADRAO_ENDERECO, "").replace(/\s{2,}/g, " ").replace(/[\s(),;:-]+$/g, "").trim();
}

/**
 * Traduz o resultado de `emitirDocumentoFiscal` para a linguagem do balcão.
 *
 * INVARIANTE: a venda NUNCA é apresentada como falha — ela já está registrada.
 * O que falha é a nota, e toda mensagem diz o que acontece a seguir.
 *
 * @param {{status?: string, detalhe?: string|null, naFila?: boolean}|null} resultado
 * @returns {{titulo: string, texto: string, motivo: string|null, automatico: boolean}}
 *   `automatico` = o sistema reenvia sozinho (a nota está na fila local).
 */
export function mensagemDesfechoNfce(resultado) {
  const status = resultado?.status ?? null;

  if (status === "rejeitada") {
    return {
      titulo: "A SEFAZ não aceitou esta nota.",
      texto: "A venda está registrada normalmente. Confira os dados fiscais e emita a nota de novo em Área Admin › Notas emitidas.",
      // Motivo da SEFAZ é informação fiscal legítima (e o contador precisa
      // dela) — vai para a tela, mas limpo de endereço de servidor.
      motivo: limparDetalheTecnico(resultado?.detalhe) || null,
      automatico: false,
    };
  }

  if (status === "sem_chave") {
    return {
      titulo: "A emissão fiscal ainda não está configurada.",
      texto: "A venda está registrada normalmente. Peça ao responsável para concluir a configuração fiscal — depois disso a nota pode ser emitida.",
      motivo: null,
      automatico: false,
    };
  }

  if (status === "erro") {
    return {
      titulo: "A nota ainda não foi emitida.",
      texto: resultado?.naFila
        ? "A venda está registrada e a nota entrou na fila: o sistema tenta emitir sozinho assim que a conexão voltar. Você pode seguir atendendo."
        : "A venda está registrada normalmente. Tente emitir a nota de novo em Área Admin › Notas emitidas.",
      motivo: null, // erro técnico (rede/servidor) nunca vai para a tela
      automatico: !!resultado?.naFila,
    };
  }

  // Sem status conhecido (ex.: venda sem item fiscal montável).
  return {
    titulo: "Esta venda não gerou nota fiscal.",
    texto: "A venda está registrada normalmente. Se precisar da nota, emita em Área Admin › Notas emitidas.",
    motivo: null,
    automatico: false,
  };
}
