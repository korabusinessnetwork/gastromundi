// Vigia dos lançamentos que chegam pelo realtime — é assim que o Palm no
// celular imprime COM internet (decisão do dono 2026-07-29).
//
// Sem internet o caminho já existe: o celular abre a página que a própria
// Ponte KORA serve na rede local e a Ponte manda pra térmica (usePonteLocal).
// COM internet o celular fala direto com o Supabase, e aí ele não tem como
// imprimir: um app servido por HTTPS só alcança `http://` no próprio
// `localhost`, e o `localhost` do celular é o celular. Quem tem a impressora
// é o computador do caixa — então é ele que reage ao pedido chegando e
// manda o papel. O garçom não precisa saber de nada disso: lançou, saiu.
//
// Roda só no desktop com alguém logado, e só se ESTE computador estiver
// marcado como o que imprime (ver `lib/impressao/aparelho`).

import { useCallback, useEffect, useRef, useState } from "react";
import { imprimirLancamento } from "@/lib/impressao/despacho";
import { registroLancamentos } from "@/lib/impressao/lancamentos";
import { aparelhoImprimeLancamentos, assinarAparelhoImprime } from "@/lib/impressao/aparelho";
import { fmtComanda } from "@/lib/impressao/layoutComanda";

/** Estado atual da chave deste aparelho, reagindo a mudanças na configuração. */
export function useAparelhoImprime() {
  const [ligado, setLigado] = useState(aparelhoImprimeLancamentos);
  useEffect(() => assinarAparelhoImprime(() => setLigado(aparelhoImprimeLancamentos())), []);
  return ligado;
}

/**
 * Como a comanda é chamada na tela do caixa. O aviso tem que dizer QUAL papel
 * faltou: "uma impressão não saiu" manda o operador procurar no escuro, com a
 * cozinha já atrasada. Mesmo formato do PDV e da Cozinha (`fmtComanda`), e
 * nunca o marcador de vazio dele, que numa frase não diria nada.
 */
export function rotuloDaComanda(pedido) {
  const nome = String(pedido?.comanda ?? "").trim();
  if (nome) return fmtComanda(nome);
  const mesa = String(pedido?.mesa ?? "").trim();
  return mesa ? `Mesa ${mesa}` : "Comanda sem nome";
}

export function useImpressaoLancamentos({ ativo, pending, loading }) {
  const semeadoRef = useRef(false);
  const filaRef = useRef(Promise.resolve());
  // Lançamentos que a impressora não colocou no papel, para o aviso da tela.
  const [falhas, setFalhas] = useState([]);

  // Antes isto era um `console.error` e nada mais: o papel sumia, o salão não
  // ficava sabendo e a cozinha só descobria quando o cliente reclamava. E não
  // é caso raro: com o driver padrão (browser-raster) a impressão automática
  // abre uma janela sem gesto do usuário, e o navegador devolve o pop-up
  // bloqueado como erro. O caminho da Ponte já faz o certo
  // (`usePonteLocal.registrarFalhaImpressao`), e agora os dois avisam igual.
  //
  // O lançamento que falhou CONTINUA marcado como visto, ou seja, não é
  // destravado para nova tentativa automática. Destravar parece o mais
  // generoso e é o pior dos dois: o `pending` muda várias vezes por minuto no
  // serviço, e cada mudança tentaria de novo o mesmo lançamento. Se a falha
  // foi pop-up bloqueado, toda tentativa falha igual e o aviso vira um piscar
  // inútil; se a impressora voltou no meio, a via sai repetida, e papel
  // dobrado na bancada é pedido feito duas vezes. Quem destrava é uma pessoa,
  // com um clique, na reimpressão da tela da Cozinha, e aí sai exatamente um
  // papel. Mesma escolha da Ponte, que também marca antes de imprimir e, na
  // falha, só reporta.
  const registrarFalha = useCallback((grupo, erro) => {
    console.error("[impressao] lançamento não saiu na produção:", erro);
    setFalhas((atuais) => (atuais.some((f) => f.chave === grupo.chave)
      ? atuais
      : [...atuais, { chave: grupo.chave, rotulo: rotuloDaComanda(grupo.pedido) }]));
  }, []);

  /** Botão do aviso: alguém foi reimprimir, o alarme já fez o trabalho dele. */
  const dispensarFalhas = useCallback(() => setFalhas([]), []);

  useEffect(() => {
    if (!ativo || loading) return;

    // Primeira passada: tudo que já está na tela nasce marcado. Sem isso,
    // abrir o sistema de manhã reimprimiria toda comanda aberta da véspera.
    if (!semeadoRef.current) {
      registroLancamentos.marcarPedidos(pending);
      semeadoRef.current = true;
      return;
    }

    const novos = registroLancamentos.novos(pending);
    if (novos.length === 0) return;

    // Marca ANTES de imprimir. A impressão é assíncrona e o `pending` muda
    // várias vezes enquanto ela acontece (o próprio realtime devolve o eco
    // da gravação) — marcar depois faria o mesmo lançamento sair duas vezes.
    for (const grupo of novos) registroLancamentos.marcar(grupo.chave);

    // Uma fila só: são poucos papéis e a térmica atende um trabalho por vez.
    // Disparar em paralelo embaralharia a ordem na bancada da cozinha.
    //
    // Continua fire-and-forget: ninguém espera esta fila para vender, e a
    // falha virar aviso na tela não muda isso.
    filaRef.current = filaRef.current.then(async () => {
      for (const grupo of novos) {
        try {
          const { error } = await imprimirLancamento({ ...grupo.pedido, items: grupo.itens });
          if (error) registrarFalha(grupo, error);
        } catch (err) {
          registrarFalha(grupo, err);
        }
      }
    });
  }, [ativo, pending, loading, registrarFalha]);

  return { falhas, dispensarFalhas };
}
