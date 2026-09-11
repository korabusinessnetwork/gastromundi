// ──────────────────────────────────────────────────────────────────
// CheckoutEntrega — como o pedido chega até o cliente.
//
// Dois caminhos, quando o estabelecimento aceita os dois: RECEBER EM
// CASA (nome/telefone + CEP → ViaCEP traz bairro/rua → taxa calculada no
// servidor) ou RETIRAR NO LOCAL (só nome/telefone + o endereço da loja,
// sem taxa). A escolha vem primeiro porque ela decide o que a tela
// pergunta: quem vai buscar não precisa digitar endereço nenhum, e pedir
// isso antes era o que fazia a pessoa inventar um endereço para
// conseguir avançar.
//
// Degradação graciosa: se o ViaCEP falhar, o cliente digita bairro/
// endereço à mão (nunca trava por terceiro). "Fora da área de entrega"
// bloqueia o avanço com aviso claro — e quando a loja simplesmente não
// cadastrou área nenhuma, a tela diz ISSO, não que o CEP dele é ruim.
//
// Dois modos de taxa, decididos pelo SERVIDOR (o cliente não sabe qual
// é): por área (bairro/CEP) resolve na 1ª chamada; por distância (km) o
// servidor responde motivo:'sem_coordenada' — então geocodificamos o
// endereço digitado (Nominatim/OSM, grátis) e recalculamos com a
// coordenada. O preço por anel é sempre do servidor.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { apenasDigitosTelefone, mascararTelefone, telefoneValido } from "@/lib/telefone";
import {
  apenasDigitosCep,
  buscarEnderecoViaCep,
  buscasDeEndereco,
  calcularTaxaEntrega,
  cepCompleto,
  formatarCep,
  formatarPreco,
  geocodificarEndereco,
} from "@/lib/delivery";
import { useSairDoModal } from "./useSairDoModal";
import "./CheckoutEntrega.css";

/** ["seu nome", "o telefone", "a rua"] → "seu nome, o telefone e a rua". */
function listaEmTexto(itens) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export default function CheckoutEntrega({
  slug,
  dados,
  permiteRetirada = false,
  enderecoRetirada = "",
  onMudar,
  onVoltar,
  onAvancar,
}) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [taxa, setTaxa] = useState(null); // { ok, taxa, motivo, km }
  const [erroTaxa, setErroTaxa] = useState("");
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  // A taxa saiu do bairro/cidade porque o mapa não achou a rua exata. O
  // pedido segue com o endereço escrito, e o cliente merece saber disso
  // antes de pagar, não depois.
  const [taxaAproximada, setTaxaAproximada] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // O aviso do telefone só aparece depois que a pessoa saiu do campo:
  // acusar "número inválido" no segundo dígito é brigar com quem ainda
  // está digitando.
  const [telefoneTocado, setTelefoneTocado] = useState(false);
  const cepAnterior = useRef("");

  // Sair daqui: tocar fora ou apertar Esc. Arrastar para selecionar
  // texto dentro do painel NÃO fecha — era esse o defeito.
  const fundo = useSairDoModal(onVoltar);
  const retirada = dados.tipo === "retirada";

  // O que está nos campos AGORA, para as respostas que chegam atrasadas. A
  // closure do efeito congela `dados` no instante em que ele foi agendado.
  const dadosRef = useRef(dados);
  useEffect(() => {
    dadosRef.current = dados;
  });

  // Quando o CEP fica completo: ViaCEP preenche bairro/rua (uma vez por CEP).
  useEffect(() => {
    if (retirada) return;
    const cep = apenasDigitosCep(dados.cep);
    if (!cepCompleto(cep) || cep === cepAnterior.current) return;

    let ativo = true;
    setBuscandoCep(true);
    (async () => {
      const { data } = await buscarEnderecoViaCep(cep);
      if (!ativo) return;
      setBuscandoCep(false);
      // Só marca o CEP como resolvido quando o ViaCEP REALMENTE respondeu.
      // Marcar antes de perguntar transformava uma queda de rede (ou o
      // ViaCEP fora do ar) em "esse CEP não preenche nada" para sempre:
      // redigitar o mesmo CEP não tentava de novo, e o cliente acabava
      // digitando bairro e rua à mão sem entender por quê.
      if (!data) return;
      cepAnterior.current = cep;
      // O que o cliente digitou ENQUANTO o ViaCEP respondia tem que valer.
      // Lendo da closure, o bairro capturado era o de antes da busca (vazio)
      // — e a resposta passava por cima do bairro que o cliente tinha
      // acabado de corrigir, na frente dele.
      const atual = dadosRef.current;
      onMudar({
        bairro: atual.bairro || data.bairro || "",
        // A cidade tem campo próprio agora. Antes ela era grudada no fim do
        // endereço ("Rua X - Porto Alegre/RS"), então o cliente apagava
        // aquilo junto ao escrever o número da casa e a cidade sumia do
        // pedido — e "Centro" sozinho não diz de qual cidade é.
        cidade: atual.cidade || [data.cidade, data.uf].filter(Boolean).join("/"),
        endereco: atual.endereco || data.logradouro || "",
      });
    })();
    return () => {
      ativo = false;
      // Desligar aqui, e não só no caminho feliz: bastava apagar um dígito
      // enquanto o ViaCEP respondia para o "Buscando endereço…" ficar colado
      // na tela pelo resto da sessão, anunciando uma busca que não existia
      // mais. O cliente esperava por ela.
      setBuscandoCep(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.cep, slug, retirada]);

  // Calcula a taxa (servidor decide o modo). Recalcula com debounce quando
  // CEP/bairro/endereço mudam. No modo por km, o servidor pede coordenada
  // (motivo:'sem_coordenada') → geocodificamos o endereço e tentamos de novo.
  useEffect(() => {
    // Retirada não tem taxa a calcular: ninguém sai para entregar. Chamar o
    // servidor aqui recusaria o pedido de quem mora fora da área e está
    // justamente indo buscar no balcão.
    if (retirada) {
      setTaxa(null);
      setErroTaxa("");
      setCalculandoTaxa(false);
      return;
    }
    const cep = apenasDigitosCep(dados.cep);
    const bairro = (dados.bairro || "").trim();
    const cidade = (dados.cidade || "").trim();
    // Dá para calcular com CEP completo, com bairro OU com cidade: a faixa
    // por bairro nunca precisou de CEP, e no modo por distância a cidade já
    // basta para o mapa achar onde é. Sem nenhum dos três não há o que
    // perguntar ao servidor, e ficar "calculando" seria a tela fingindo que
    // trabalha.
    if (!cepCompleto(cep) && !bairro && !cidade) {
      setTaxa(null);
      setErroTaxa("");
      setCalculandoTaxa(false);
      setTaxaAproximada(false);
      return;
    }

    // JÁ marca como recalculando — não daqui a 700 ms, quando o debounce
    // dispara. Nessa janela a taxa na tela era a do endereço ANTERIOR e o
    // botão continuava liberado: dava tempo de trocar o bairro e avançar
    // pagando R$ 5 de um endereço que custa R$ 20 (ou que nem é atendido).
    // O servidor recalcula no fim, então o cliente só descobria no último
    // clique — cobrado a mais ou recusado depois de preencher tudo.
    let ativo = true;
    setCalculandoTaxa(true);
    const t = setTimeout(async () => {
      // 1ª tentativa sem coordenada — o modo por área (bairro/CEP) resolve aqui.
      let { data: res } = await calcularTaxaEntrega(slug, cep, bairro);

      // Modo por distância: o servidor pediu coordenada. Geocodifica o que
      // o cliente escreveu e recalcula. As buscas vão da mais exata (rua,
      // número, bairro, cidade) para a mais larga (bairro e cidade, depois
      // só a cidade): uma letra errada no nome da rua não pode travar o
      // pedido, porque quem entrega é gente e vai ler o endereço escrito.
      let coord = null;
      let aproximada = false;
      if (res?.motivo === "sem_coordenada") {
        // Duas tentativas, não a lista inteira: cada ida ao mapa espera até
        // 8 segundos por um terceiro que pode estar pendurado, e três delas
        // seguidas deixariam a tela "calculando" por quase meio minuto. A
        // exata e a melhor região resolvem o caso real, que é a rua escrita
        // de um jeito que o mapa não conhece.
        const buscas = buscasDeEndereco({ ...dadosRef.current, cep, bairro, cidade }).slice(
          0,
          2
        );
        for (let i = 0; i < buscas.length; i++) {
          const { data: geo } = await geocodificarEndereco(buscas[i]);
          if (!geo) continue;
          coord = geo;
          aproximada = i > 0;
          const r2 = await calcularTaxaEntrega(slug, cep, bairro, geo.lat, geo.lng);
          res = r2.data;
          break;
        }
      }

      if (!ativo) return;
      setTaxa(res);
      // Sem resposta nenhuma (rede caída, RPC fora do ar, estabelecimento sem
      // entrega configurada) a tela não dizia UMA palavra: nenhum aviso,
      // nenhuma taxa, e o "Ir para o pagamento" desabilitado sem motivo
      // visível. O cliente preenchia tudo e ficava clicando num botão morto.
      setErroTaxa(
        res
          ? ""
          : "Não conseguimos calcular a taxa de entrega agora. Confira sua conexão e tente de novo."
      );
      setTaxaAproximada(Boolean(res?.ok && aproximada));
      if (res?.ok) {
        onMudar({
          taxa: Number(res.taxa) || 0,
          lat: coord ? coord.lat : null,
          lng: coord ? coord.lng : null,
        });
      }
      setCalculandoTaxa(false);
    }, 700);

    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dados.cep,
    dados.cidade,
    dados.bairro,
    dados.endereco,
    dados.numero,
    slug,
    tentativa,
    retirada,
  ]);

  const semCoordenada = taxa?.motivo === "sem_coordenada";
  const indisponivelKm = taxa?.motivo === "origem_indefinida";
  // A loja não cadastrou faixa nenhuma. Isso NÃO é "seu endereço é fora da
  // área": era essa confusão que fazia todo CEP ser recusado e o campo
  // parecer quebrado.
  const semArea = taxa?.motivo === "sem_area";
  const foraDeArea = taxa && !taxa.ok && !semCoordenada && !indisponivelKm && !semArea;
  const temTaxa = taxa?.ok;
  const telefoneOk = telefoneValido(dados.telefone);
  const telefoneRuim = telefoneTocado && !telefoneOk;

  // O CEP saiu daqui de propósito: quem manda é a TAXA ter sido resolvida.
  // Exigir os 8 dígitos travava quem não sabe o próprio CEP mesmo com o
  // bairro atendido e a taxa já na tela. O telefone, ao contrário, entrou:
  // sem ele ninguém consegue falar com o cliente quando o pedido trava.
  const numero = (dados.numero || "").trim();
  const podeAvancar = retirada
    ? Boolean(dados.nome.trim() && telefoneOk)
    : Boolean(
        dados.nome.trim() &&
          telefoneOk &&
          dados.endereco.trim() &&
          numero &&
          temTaxa &&
          !calculandoTaxa
      );

  // Botão desabilitado sem explicação é a tela travando sem dizer por quê:
  // o cliente preenche tudo o que vê, clica, e nada acontece. Aqui ela diz
  // o que ainda falta, com o nome do campo que está na frente dele.
  const faltando = [
    !dados.nome.trim() && "seu nome",
    !telefoneOk && "o telefone",
    !retirada && !dados.endereco.trim() && "a rua",
    !retirada && !numero && "o número",
  ].filter(Boolean);

  // Trocar de caminho zera o que era do outro: a taxa de uma entrega não
  // pode sobreviver a "vou buscar" (o cliente pagaria por uma corrida que
  // não vai acontecer).
  const escolherTipo = (tipo) => {
    if (tipo === dados.tipo) return;
    onMudar(
      tipo === "retirada"
        ? { tipo, taxa: 0, lat: null, lng: null }
        : { tipo, taxa: 0 }
    );
  };

  return (
    <div className="modal-fundo" {...fundo}>
      <div className="modal-painel">
        <div className="modal-topo">
          <h2 className="modal-titulo">{retirada ? "Retirada" : "Entrega"}</h2>
          <button className="modal-fechar" onClick={onVoltar} aria-label="Voltar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {/* A primeira pergunta, porque ela decide todas as outras. Só
              aparece quando o estabelecimento realmente aceita os dois. */}
          {permiteRetirada && (
            <div className="entrega-tipo" role="group" aria-label="Como você quer receber">
              {[
                { id: "entrega", emoji: "🛵", titulo: "Receber em casa", desc: "Levamos no seu endereço" },
                { id: "retirada", emoji: "🏪", titulo: "Retirar no local", desc: "Você busca no balcão · sem taxa" },
              ].map((o) => {
                const ativo = (dados.tipo ?? "entrega") === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`entrega-tipo__card${ativo ? " entrega-tipo__card--ativo" : ""}`}
                    aria-pressed={ativo}
                    onClick={() => escolherTipo(o.id)}
                  >
                    <span className="entrega-tipo__emoji" aria-hidden="true">{o.emoji}</span>
                    <span className="entrega-tipo__titulo">{o.titulo}</span>
                    <span className="entrega-tipo__desc">{o.desc}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="campo">
            <label className="campo__label" htmlFor="ent-nome">
              Seu nome
            </label>
            <input
              id="ent-nome"
              className="campo__input"
              autoComplete="name"
              value={dados.nome}
              maxLength={60}
              onChange={(e) => onMudar({ nome: e.target.value })}
              placeholder="Como te chamamos?"
            />
          </div>

          {/* Telefone é obrigatório: é o único caminho que o estabelecimento
              tem até o cliente quando algo dá errado — o entregador não acha
              o endereço, um item acabou, a campainha não toca. Sem ele o
              pedido vira um bilhete sem remetente, e o botão de WhatsApp no
              painel de quem despacha fica inerte. A máscara vai fechando
              sozinha enquanto se digita, e o aviso só aparece depois que a
              pessoa saiu do campo — cobrar erro no meio da digitação é
              acusar quem ainda está escrevendo. */}
          <div className="campo">
            <label className="campo__label" htmlFor="ent-tel">
              Telefone
            </label>
            <input
              id="ent-tel"
              className="campo__input"
              autoComplete="tel"
              value={mascararTelefone(dados.telefone)}
              // 15 = "(11) 91234-5678". A máscara já corta em 11 dígitos,
              // mas o teto declarado é o que o guard de limites confere
              // contra a coluna do banco (deliveryLimitesSqlGuard).
              maxLength={15}
              inputMode="tel"
              onChange={(e) => onMudar({ telefone: apenasDigitosTelefone(e.target.value) })}
              onBlur={() => setTelefoneTocado(true)}
              aria-invalid={telefoneRuim || undefined}
              placeholder="(11) 91234-5678"
            />
            {telefoneRuim ? (
              <p className="linha-sacola__extra checkout-entrega__erro" role="alert">
                Confira o telefone: DDD e o número completo.
              </p>
            ) : (
              <p className="linha-sacola__extra checkout-entrega__ajuda">
                {retirada
                  ? "É como avisamos que seu pedido está pronto para retirar."
                  : "É como o entregador fala com você se precisar."}
              </p>
            )}
          </div>

          {retirada ? (
            // Onde buscar, quando fica pronto e quanto custa a entrega
            // (nada) — as três coisas que quem vai retirar precisa saber.
            <div className="retirada-box">
              <p className="retirada-box__titulo">Retire em</p>
              <p className="retirada-box__endereco">{enderecoRetirada}</p>
              <p className="retirada-box__nota">
                Sem taxa de entrega. Avisamos quando estiver pronto para retirar.
              </p>
            </div>
          ) : (
            <>
              {/* Onde você está vem PRIMEIRO: é o que decide se a loja
                  entrega aí e por quanto. Perguntar a rua antes disso é
                  pedir para a pessoa digitar tudo para só então descobrir
                  que não é atendida. */}
              <div className="campo">
                <label className="campo__label" htmlFor="ent-cep">
                  CEP <span className="campo__opcional">(opcional)</span>
                </label>
                <input
                  id="ent-cep"
                  className="campo__input"
                  autoComplete="postal-code"
                  value={formatarCep(dados.cep)}
                  inputMode="numeric"
                  onChange={(e) => onMudar({ cep: apenasDigitosCep(e.target.value) })}
                  placeholder="00000-000"
                />
                {buscandoCep ? (
                  <p className="linha-sacola__extra checkout-entrega__buscando">
                    Buscando endereço…
                  </p>
                ) : (
                  <p className="linha-sacola__extra checkout-entrega__ajuda">
                    Sabendo o CEP, a gente preenche o resto. Não sabe? Preencha a
                    cidade e o bairro abaixo.
                  </p>
                )}
              </div>

              <div className="campo">
                <label className="campo__label" htmlFor="ent-cidade">
                  Cidade
                </label>
                <input
                  id="ent-cidade"
                  className="campo__input"
                  autoComplete="address-level2"
                  value={dados.cidade ?? ""}
                  maxLength={80}
                  onChange={(e) => onMudar({ cidade: e.target.value })}
                  placeholder="Sua cidade"
                />
              </div>

              <div className="campo">
                <label className="campo__label" htmlFor="ent-bairro">
                  Bairro
                </label>
                <input
                  id="ent-bairro"
                  className="campo__input"
                  autoComplete="address-level3"
                  value={dados.bairro}
                  maxLength={80}
                  onChange={(e) => onMudar({ bairro: e.target.value })}
                  placeholder="Seu bairro"
                />
              </div>

              {/* Rua e número em campos separados. Juntos, o número era a
                  parte que mais se perdia: quem corrigia a rua apagava o
                  número junto, e o pedido chegava na cozinha sem dizer em
                  qual casa parar. Lado a lado porque são uma informação só
                  para quem lê, e o número é curto. */}
              <div className="campo-linha">
                <div className="campo">
                  <label className="campo__label" htmlFor="ent-end">
                    Rua
                  </label>
                  <input
                    id="ent-end"
                    className="campo__input"
                    autoComplete="address-line1"
                    value={dados.endereco}
                    maxLength={160}
                    onChange={(e) => onMudar({ endereco: e.target.value })}
                    placeholder="Nome da rua"
                  />
                </div>

                <div className="campo">
                  <label className="campo__label" htmlFor="ent-numero">
                    Número
                  </label>
                  <input
                    id="ent-numero"
                    className="campo__input"
                    // Sem autocompletar: "address-line2" é do complemento,
                    // logo abaixo, e o navegador acabava oferecendo "Apto 32"
                    // no campo do número da casa.
                    value={dados.numero ?? ""}
                    maxLength={10}
                    onChange={(e) => onMudar({ numero: e.target.value })}
                    placeholder="123 ou S/N"
                  />
                </div>
              </div>

              <div className="campo">
                <label className="campo__label" htmlFor="ent-compl">
                  Complemento (opcional)
                </label>
                <input
                  id="ent-compl"
                  className="campo__input"
                  autoComplete="address-line2"
                  value={dados.complemento}
                  maxLength={80}
                  onChange={(e) => onMudar({ complemento: e.target.value })}
                  placeholder="Apto, bloco, referência"
                />
              </div>

              {calculandoTaxa && (
                <div className="vitrine__aviso">Calculando a taxa de entrega…</div>
              )}
              {!calculandoTaxa && erroTaxa && (
                <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
                  <span>{erroTaxa}</span>
                  <button
                    type="button"
                    className="vitrine__aviso-acao"
                    onClick={() => setTentativa((n) => n + 1)}
                  >
                    Tentar de novo
                  </button>
                </div>
              )}
              {!calculandoTaxa && semArea && (
                <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
                  <span>
                    Este estabelecimento ainda não configurou as áreas de entrega
                    {permiteRetirada
                      ? " — por enquanto dá para retirar no local."
                      : ". Fale com ele para combinar a entrega."}
                  </span>
                  {permiteRetirada && (
                    <button
                      type="button"
                      className="vitrine__aviso-acao"
                      onClick={() => escolherTipo("retirada")}
                    >
                      Retirar no local
                    </button>
                  )}
                </div>
              )}
              {!calculandoTaxa && semCoordenada && (
                <div className="vitrine__aviso vitrine__aviso--erro">
                  Não consegui localizar esse endereço no mapa. Confira a cidade e o
                  bairro para calcular a entrega.
                </div>
              )}
              {!calculandoTaxa && indisponivelKm && (
                <div className="vitrine__aviso vitrine__aviso--erro">
                  A entrega por distância está indisponível no momento. Fale com o
                  estabelecimento.
                </div>
              )}
              {!calculandoTaxa && foraDeArea && (
                <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
                  <span>
                    Esse endereço está fora da nossa área de entrega. Confira o CEP ou o
                    bairro.
                  </span>
                  {permiteRetirada && (
                    <button
                      type="button"
                      className="vitrine__aviso-acao"
                      onClick={() => escolherTipo("retirada")}
                    >
                      Retirar no local
                    </button>
                  )}
                </div>
              )}
              {/* A taxa saiu da região (bairro, cidade ou CEP), não da rua
                  exata. Dito
                  antes de pagar, e não depois: o valor pode mudar quando o
                  estabelecimento olhar o endereço. */}
              {!calculandoTaxa && temTaxa && taxaAproximada && (
                <div className="vitrine__aviso">
                  Não achamos essa rua no mapa, então calculamos a entrega pela
                  região que você informou. Seu pedido vai com o endereço exatamente
                  como você escreveu.
                </div>
              )}
              {temTaxa && (
                <div className="resumo">
                  <div className="resumo__linha">
                    <span>Taxa de entrega{Number(taxa?.km) > 0 ? ` · ${String(taxa.km).replace(".", ",")} km` : ""}</span>
                    <span>
                      {Number(dados.taxa) > 0 ? formatarPreco(dados.taxa) : "Grátis"}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {!podeAvancar && !calculandoTaxa && faltando.length > 0 && (
            <p className="linha-sacola__extra checkout-entrega__falta">
              Falta preencher {listaEmTexto(faltando)}.
            </p>
          )}

          <button
            className="btn btn--primario checkout-entrega__avancar"
            onClick={onAvancar}
            disabled={!podeAvancar}
          >
            <span>Ir para o pagamento</span>
          </button>
        </div>
      </div>
    </div>
  );
}
