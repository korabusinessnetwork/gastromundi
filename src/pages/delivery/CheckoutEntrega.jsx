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
  calcularTaxaEntrega,
  cepCompleto,
  dataNascimentoUtil,
  formatarCep,
  formatarPreco,
  juntarRuaNumero,
  localizarEndereco,
  montarDataISO,
  separarDataISO,
} from "@/lib/delivery";
import { entregaLembrada } from "@/lib/deliveryDispositivo";
import { useSairDoModal } from "./useSairDoModal";
import "./CheckoutEntrega.css";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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
  // Taxa calculada por aproximação (não achamos a rua exata no mapa).
  const [taxaAproximada, setTaxaAproximada] = useState(false);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // O aviso do telefone só aparece depois que a pessoa saiu do campo:
  // acusar "número inválido" no segundo dígito é brigar com quem ainda
  // está digitando.
  const [telefoneTocado, setTelefoneTocado] = useState(false);
  const cepAnterior = useRef("");

  // Primeiro pedido DESTE aparelho: o armazenamento local só tem dados de
  // entrega depois que alguém pediu daqui. É o sinal que a vitrine já usa
  // para pré-preencher o formulário, e serve aqui sem inventar nada nem
  // perguntar ao servidor se o telefone é conhecido — o que, além de uma
  // ida à rede, diria a qualquer um se um número é cliente da casa.
  // Lido UMA vez: ele passa a ser falso assim que o pedido é salvo, e o
  // campo não pode sumir da tela no meio do preenchimento.
  const [primeiroPedido] = useState(() => Object.keys(entregaLembrada()).length === 0);
  // Data de nascimento em três campos. O <input type="date"> abria o
  // calendário no mês ATUAL: para nascer em 1962 a pessoa tinha de
  // recuar 700 e poucos meses, ou achar o seletor de ano escondido no
  // cabeçalho do popup. Digitar o ano é um gesto. Os três campos vivem
  // aqui (não no estado do pedido) porque "07/1/" é um passo válido da
  // digitação, e só a data COMPLETA sobe.
  const [nasc, setNasc] = useState(() => separarDataISO(dados.dataNascimento));
  const anoMax = new Date().getFullYear();

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
        // O ViaCEP devolve o LOGRADOURO, que é exatamente a rua — o
        // número nunca veio dele, e agora tem campo próprio para a
        // pessoa digitar. Preencher a rua não pisa no número.
        rua: atual.rua || data.logradouro || "",
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
    // Dá para calcular com CEP completo OU com bairro — a faixa por bairro
    // nunca precisou de CEP. Sem nenhum dos dois não há o que perguntar ao
    // servidor, e ficar "calculando" seria a tela fingindo que trabalha.
    if (!cepCompleto(cep) && !bairro) {
      setTaxa(null);
      setErroTaxa("");
      setCalculandoTaxa(false);
      return;
    }
    // O mapa recebe a linha única de sempre — a separação é da TELA, e
    // a escada de geocodificação já sabe tirar o número quando atrapalha.
    const endereco = juntarRuaNumero(dados.rua, dados.numero);

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

      // Modo por distância: o servidor pediu coordenada. Geocodifica o
      // endereço digitado e recalcula. Falha de geocode → mantém o motivo.
      let coord = null;
      if (res?.motivo === "sem_coordenada" && (endereco.trim() || bairro)) {
        // Escada de consultas (ver localizarEndereco): a rua com a cidade
        // primeiro, e degraus cada vez mais tolerantes até o bairro. Antes
        // era UMA tentativa, sem a cidade — uma letra trocada na rua
        // derrubava o pedido inteiro e o botão ficava morto sem explicar.
        const { data: geo } = await localizarEndereco({
          endereco, bairro, cidade: dados.cidade, cep,
        });
        if (geo) {
          coord = geo;
          const r2 = await calcularTaxaEntrega(slug, cep, bairro, geo.lat, geo.lng);
          res = r2.data;
        }
      }

      if (!ativo) return;
      setTaxa(res);
      // A coordenada veio do bairro/CEP, não da rua: a taxa é uma
      // estimativa e o cliente precisa saber antes de fechar o pedido.
      setTaxaAproximada(Boolean(res?.ok && coord && coord.precisao === "aproximada"));
      // Sem resposta nenhuma (rede caída, RPC fora do ar, estabelecimento sem
      // entrega configurada) a tela não dizia UMA palavra: nenhum aviso,
      // nenhuma taxa, e o "Ir para o pagamento" desabilitado sem motivo
      // visível. O cliente preenchia tudo e ficava clicando num botão morto.
      setErroTaxa(
        res
          ? ""
          : "Não conseguimos calcular a taxa de entrega agora. Confira sua conexão e tente de novo."
      );
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
  }, [dados.cep, dados.bairro, dados.rua, dados.numero, dados.cidade, slug, tentativa, retirada]);

  // Um campo mexido → recompõe a data e sobe só se estiver completa.
  // Incompleta sobe "" (o campo é opcional, e meia data não é dado).
  function atualizarNascimento(parte) {
    const proximo = { ...nasc, ...parte };
    setNasc(proximo);
    onMudar({ dataNascimento: montarDataISO(proximo.dia, proximo.mes, proximo.ano) });
  }

  // Os três preenchidos mas a data não se sustenta (31 de fevereiro, ano
  // no futuro, 1850). Só avisamos com os TRÊS completos: acusar erro no
  // meio da digitação é brigar com quem ainda está escrevendo. O aviso
  // não bloqueia — a data é opcional e o pedido segue sem ela.
  const nascCompleto = Boolean(nasc.dia && nasc.mes && nasc.ano.length === 4);
  const nascimentoRuim = nascCompleto && !dataNascimentoUtil(
    montarDataISO(nasc.dia, nasc.mes, nasc.ano)
  );

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
  // A RUA é o obrigatório, não o número: quem mora em estrada sem número
  // pede do mesmo jeito e explica no complemento.
  const podeAvancar = retirada
    ? Boolean(dados.nome.trim() && telefoneOk)
    : Boolean(
        dados.nome.trim() && telefoneOk && (dados.rua ?? "").trim() && temTaxa && !calculandoTaxa
      );

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

          {/* Só no PRIMEIRO pedido deste aparelho, e opcional. Perguntar a
              data de nascimento em toda compra seria pedágio: quem já pediu
              antes não vê este campo. O "(opcional)" está no rótulo, não
              escondido na ajuda, porque um campo a mais entre a pessoa e a
              comida precisa dizer na hora que dá para pular. */}
          {primeiroPedido && (
            <div className="campo">
              <span className="campo__label" id="ent-nasc-rotulo">
                Data de nascimento <span className="campo__opcional">(opcional)</span>
              </span>
              {/* Dia, mês e ano em campos próprios: sem calendário para
                  navegar e sem "dd/mm/aaaa" dentro da caixa. Cada campo
                  diz o que é pelo rótulo acima dele, então vazio é vazio
                  — não um exemplo que parece texto já digitado. */}
              <div className="nascimento" role="group" aria-labelledby="ent-nasc-rotulo">
                <div className="nascimento__parte">
                  <label className="nascimento__mini" htmlFor="ent-nasc-dia">Dia</label>
                  <input
                    id="ent-nasc-dia"
                    className="campo__input nascimento__campo"
                    inputMode="numeric"
                    maxLength={2}
                    value={nasc.dia}
                    onChange={(e) =>
                      atualizarNascimento({ dia: e.target.value.replace(/\D/g, "").slice(0, 2) })
                    }
                  />
                </div>
                <div className="nascimento__parte nascimento__parte--mes">
                  <label className="nascimento__mini" htmlFor="ent-nasc-mes">Mês</label>
                  {/* Nome por extenso mata a dúvida dd/mm × mm/dd de vez,
                      e em lista é um toque em vez de dois dígitos. */}
                  <select
                    id="ent-nasc-mes"
                    className="campo__input nascimento__campo nascimento__campo--mes"
                    value={nasc.mes}
                    onChange={(e) => atualizarNascimento({ mes: e.target.value })}
                  >
                    <option value="">—</option>
                    {MESES.map((nome, i) => (
                      <option key={nome} value={String(i + 1)}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="nascimento__parte">
                  <label className="nascimento__mini" htmlFor="ent-nasc-ano">Ano</label>
                  <input
                    id="ent-nasc-ano"
                    className="campo__input nascimento__campo"
                    inputMode="numeric"
                    maxLength={4}
                    value={nasc.ano}
                    onChange={(e) =>
                      atualizarNascimento({ ano: e.target.value.replace(/\D/g, "").slice(0, 4) })
                    }
                  />
                </div>
              </div>
              {nascimentoRuim ? (
                <p className="linha-sacola__extra checkout-entrega__erro" role="alert">
                  Confira a data: dia de 1 a 31 e ano entre 1900 e {anoMax}. Se
                  preferir, deixe os três campos em branco, é opcional.
                </p>
              ) : (
                <p className="linha-sacola__extra checkout-entrega__ajuda">
                  Só para o estabelecimento lembrar de você no seu aniversário.
                  Não é usado em mais nada e não atrapalha o pedido.
                </p>
              )}
            </div>
          )}

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

              {/* Rua e número separados. Juntos num campo só, o número
                  ia colado no fim da rua e sumia junto toda vez que a
                  pessoa voltava para corrigir a grafia — e endereço sem
                  número é a entrega que o entregador não acha. */}
              <div className="campo">
                <label className="campo__label" htmlFor="ent-rua">
                  Rua
                </label>
                <input
                  id="ent-rua"
                  className="campo__input"
                  autoComplete="address-line1"
                  value={dados.rua ?? ""}
                  maxLength={140}
                  onChange={(e) => onMudar({ rua: e.target.value })}
                />
              </div>

              <div className="campo">
                <label className="campo__label" htmlFor="ent-num">
                  Número
                </label>
                <input
                  id="ent-num"
                  className="campo__input campo__input--curto"
                  autoComplete="address-line2"
                  inputMode="numeric"
                  value={dados.numero ?? ""}
                  maxLength={12}
                  onChange={(e) => onMudar({ numero: e.target.value })}
                />
                <p className="linha-sacola__extra checkout-entrega__ajuda">
                  Sem número na rua? Deixe em branco e escreva a referência no
                  complemento.
                </p>
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
                      ? " , por enquanto dá para retirar no local."
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
              {/* Só chega aqui quando NENHUM degrau da escada achou nada —
                  nem o bairro com a cidade. Aí o que falta mesmo é a
                  cidade ou o bairro, não a grafia da rua, e a mensagem
                  precisa dizer onde mexer em vez de mandar conferir tudo. */}
              {!calculandoTaxa && semCoordenada && (
                <div className="vitrine__aviso vitrine__aviso--erro">
                  Não consegui localizar esse endereço no mapa. Confira a cidade e o
                  bairro: com os dois preenchidos eu consigo calcular a entrega mesmo
                  que a rua esteja com algum erro de digitação.
                </div>
              )}
              {/* Achou pelo bairro ou pelo CEP, não pela rua. A taxa sai e o
                  pedido anda, mas dizer que é estimada é o mínimo: ela foi
                  medida do centro do bairro, não da porta do cliente. */}
              {!calculandoTaxa && temTaxa && taxaAproximada && (
                <div className="vitrine__aviso">
                  Não achei a rua exata no mapa, então calculei a entrega pelo seu
                  bairro. O valor pode mudar um pouco na confirmação do
                  estabelecimento.
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
