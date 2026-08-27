// Leva 13 — aba "Pedidos sem Internet" (Ponte KORA).
//
// Intuitiva por design: uma chave em cima diz o que o recurso FAZ ("receber
// pedidos do celular do garçom neste computador"), um status de uma linha diz
// se a ponte está rodando; quando está e a chave está ligada, a tela vira um
// QR gigante + 3 passos numerados — o gerente só aponta a câmera do celular.
// Quando não está, mostra o caminho de instalação em linguagem de balcão,
// sem jargão.
//
// A chave é por estabelecimento (config "ponte_local_ativa", decisão 017):
// o dono liga o recurso na própria tela, ninguém precisa recompilar nada.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/context/AppContext";
import { pingPonte, buscarInfoPonte, montarEnderecoPalm } from "@/lib/ponte";
// Endereço de onde o dono baixa a Ponte — o mesmo arquivo que a tela de
// impressão oferece. Vazio quando o build não recebeu endereço válido.
import { ENDERECO_DOWNLOAD_PONTE } from "@/lib/ponteDownload";
import { LuDownload } from "react-icons/lu";
import "./PonteLocalConfig.css";

const INTERVALO_MS = 5000;

export default function PonteLocalConfig({ sz }) {
  const {
    ponteLocalAtiva, setPonteLocalAtiva, loading, redeOnline, abriuSemInternet,
    recarregarDadosDoEstabelecimento,
  } = useApp();
  const [status, setStatus] = useState("procurando"); // procurando | rodando | ausente
  const [endereco, setEndereco] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [vinculo, setVinculo] = useState(null); // a ponte já sabe de quem é?
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(false);
  const [buscando, setBuscando] = useState(false);   // a busca do dono está rodando
  const [tentouAgora, setTentouAgora] = useState(false); // o dono já pediu a busca nesta tela

  // `null` = o ajuste do estabelecimento não chegou. Nesse instante a chave
  // não pode aparecer nem ligada nem desligada: mostraria uma resposta que
  // ainda não temos e piscaria quando a de verdade chegasse.
  //
  // Mas "não chegou" tem duas causas bem diferentes, e o dono precisa saber
  // qual delas é. Enquanto o sistema ainda está abrindo, é só demora. Depois
  // que ele terminou de abrir (abriu sem internet, e a última cópia salva não
  // tinha essa chave ou não existia; ou o banco recusou a leitura dos
  // ajustes), o ajuste NÃO VEM MAIS — deixar "Carregando…" para sempre faz o
  // dono concluir que o recurso está quebrado. Nos dois casos a chave fica
  // travada: chutar ligado ou desligado aqui é chutar se a comanda vai sair
  // na impressora.
  const semAjuste   = ponteLocalAtiva === null;
  const carregando  = semAjuste && loading;
  const naoCarregou = semAjuste && !loading;
  const ligada      = ponteLocalAtiva === true;
  // E "não vem mais" também tem duas causas. Sem internet (abriu com a última
  // cópia salva, e ela é antiga demais para conhecer esta chave) recarregar
  // a tela cai no mesmo caminho e devolve o mesmo recado: a tela pisca e nada
  // muda. Aí o que serve é outro botão — o que busca o ajuste de novo, para o
  // dono usar quando a conexão voltar. Com rede, o que sobrou é falha de
  // leitura no banco — recarregar a tela tem chance real, então o botão fica.
  //
  // São DOIS sinais de "sem internet" porque um só não pega o caso mais comum
  // do restaurante: roteador de pé e link do provedor caído. Aí o navegador
  // continua se dizendo online (`redeOnline`, que é o `navigator.onLine`) e
  // quem sabe a verdade é o AppContext: nenhuma leitura alcançou o banco — nem
  // a do perfil de quem está logado — e ele abriu com o que estava salvo neste
  // computador, ligando `abriuSemInternet`. Comparação explícita nos dois de
  // propósito: só um "sem internet" afirmado troca o recado, e contexto que
  // não entrega o campo (`undefined`) segue pelo caminho de sempre.
  //
  // O segundo sinal cai sozinho quando ESTE computador reconecta (o AppContext
  // escuta o evento do navegador). Link do provedor que volta sem o computador
  // ter perdido a rede não avisa ninguém — por isso o recado de sem internet
  // vem com o botão que busca o ajuste de novo: quem diz que a conexão voltou
  // é o dono, no clique, e a carga que roda aí é a mesma da abertura do
  // sistema. Nada tenta sozinho.
  const semInternet = naoCarregou && (redeOnline === false || abriuSemInternet === true);

  useEffect(() => {
    let vivo = true;
    const verificar = async () => {
      const { error } = await pingPonte();
      if (!vivo) return;
      if (error) {
        setStatus("ausente");
        setEndereco(null);
        return;
      }
      setStatus("rodando");
      const { data: info } = await buscarInfoPonte();
      if (!vivo) return;
      setEndereco(montarEnderecoPalm(info));
      setVinculo(info?.estabelecimento ?? null);
    };
    verificar();
    const timer = setInterval(verificar, INTERVALO_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!endereco) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(endereco, { width: 400, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [endereco]);

  const alternarRecebimento = async () => {
    if (semAjuste || salvando) return;
    setSalvando(true);
    setErroSalvar(false);
    const { error } = await setPonteLocalAtiva(!ligada);
    setSalvando(false);
    // O AppContext já desfaz o estado quando a gravação falha; aqui só
    // avisamos, porque uma chave que volta sozinha sem explicação parece bug.
    if (error) setErroSalvar(true);
  };

  // Saída do "Sem internet agora", e só no clique de uma pessoa. Refaz a carga
  // do estabelecimento — o mesmo caminho da abertura do sistema. Com a
  // conexão de volta, o ajuste chega e a tela se recupera; ainda sem conexão,
  // o contexto carimba de novo e o recado abaixo conta que a tentativa não
  // deu. Quem barra o clique duplo é o `disabled` do botão, que segue este
  // `buscando`. O `finally` é o que garante o botão de volta mesmo se a carga
  // estourar no meio — botão travado para sempre é pior que carga que falhou.
  const buscarAjusteDeNovo = async () => {
    setBuscando(true);
    setTentouAgora(false);
    try {
      await recarregarDadosDoEstabelecimento();
    } finally {
      setBuscando(false);
      setTentouAgora(true);
    }
  };

  // O recado de "sem internet" só promete o que o sistema faz: o ajuste é lido
  // quando o sistema abre e nada o relê sozinho quando a conexão volta, então
  // dizer que ele "só chega quando a conexão voltar" deixava o dono esperando
  // por algo que não vem. Quem busca é ele, no botão logo abaixo — e é isso
  // que a frase pede. Depois de uma busca que não achou conexão, o recado
  // muda: o dono precisa ver que tentou e não deu, senão parece que o clique
  // não fez nada.
  const recado =
    carregando ? "Carregando o ajuste deste estabelecimento…"
    : semInternet && tentouAgora ? "Ainda sem internet — tentamos agora e não deu. Toque de novo quando a conexão voltar."
    : semInternet ? "Sem internet agora — quando a conexão voltar, toque no botão abaixo para buscar o ajuste deste estabelecimento."
    : naoCarregou ? "Não deu para carregar o ajuste deste estabelecimento — confira a internet e recarregue a tela."
    : salvando ? "Salvando…"
    : erroSalvar ? "Não deu para salvar. Confira a internet e tente de novo."
    : ligada ? "Ligado"
    : "Desligado";

  return (
    <div className="ponte-config">
      <div className="ponte-config__chave">
        <div className="ponte-config__chave-texto">
          <div className="ponte-config__chave-titulo">
            Receber pedidos do celular do garçom neste computador
          </div>
          <div className="ponte-config__chave-ajuda">
            Precisa do programa <strong>KORA Ponte</strong> instalado neste computador (o do
            caixa). Com a chave ligada, o pedido que o garçom manda pelo celular cai aqui e
            sai na impressora — mesmo com a internet fora do ar.
          </div>
          <div
            className={`ponte-config__chave-estado${erroSalvar ? " ponte-config__chave-estado--erro" : ""}${naoCarregou ? " ponte-config__chave-estado--alerta" : ""}`}
            role="status"
          >
            {recado}
          </div>
          {/* O ajuste é lido uma vez, quando o sistema abre — então a saída
              deste estado é abrir de novo. Botão à vista para o dono não
              ficar preso olhando um recado sem ter o que fazer. Sem internet
              ele some: recarregar AGORA refaz o mesmo caminho e mostra o mesmo
              recado, e botão que não resolve o que promete é pior que botão
              nenhum — nesse caso a saída é o botão de baixo. */}
          {naoCarregou && !semInternet && (
            <button
              type="button"
              className="ponte-config__recarregar"
              onClick={() => window.location.reload()}
            >
              Recarregar a tela
            </button>
          )}
          {/* Saída do caso sem internet. O link do provedor volta sem o
              navegador perceber, então quem avisa é o dono: um clique refaz a
              carga do estabelecimento sem fechar o sistema. Fica montado
              enquanto a busca roda (aí o `loading` do contexto derruba o
              `semInternet` por um instante) para o dono não ver o botão sumir
              debaixo do dedo justo quando clicou. */}
          {(semInternet || buscando) && (
            <button
              type="button"
              className="ponte-config__buscar"
              onClick={buscarAjusteDeNovo}
              disabled={buscando}
            >
              {buscando ? "Buscando o ajuste…" : "Já voltou a internet? Buscar o ajuste agora"}
            </button>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-label="Receber pedidos do celular do garçom neste computador"
          onClick={alternarRecebimento}
          disabled={semAjuste || salvando}
          className={`ponte-config__toggle${ligada ? " ponte-config__toggle--on" : ""}`}
        >
          <span className="ponte-config__toggle-bolinha" />
        </button>
      </div>

      <div className="ponte-config__status">
        <span className={`ponte-config__dot ${status === "rodando" ? "ponte-config__dot--on" : "ponte-config__dot--off"}`} />
        {status === "procurando" && "Procurando a ponte neste computador…"}
        {status === "rodando"    && (vinculo?.vinculado
          ? `Ponte ligada e vinculada a ${vinculo.nome} — pedidos e impressão funcionam mesmo sem internet.`
          : "Ponte rodando neste computador — pedidos funcionam mesmo sem internet.")}
        {status === "ausente"    && "Ponte não encontrada neste computador."}
      </div>

      {/* Prevenir o erro em vez de avisar depois: com a chave desligada o QR
          não serve para nada — o garçom escanearia, mandaria o pedido e ele
          ficaria parado na ponte. Então o QR só aparece com a chave ligada. */}
      {status === "rodando" && !ligada && !semAjuste && (
        <div className="ponte-config__aviso">
          O programa está rodando, mas a chave acima está desligada — nada do celular chega
          ao caixa. Ligue a chave para liberar o QR code dos garçons.
        </div>
      )}

      {status === "rodando" && ligada && (
        <div className="ponte-config__card">
          {qrDataUrl
            ? <img className="ponte-config__qr" src={qrDataUrl} alt="QR code do modo local" />
            : <div className="ponte-config__qr" />}
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ marginTop: 0 }}><strong>Prepare os celulares da equipe (uma vez só):</strong></p>
            <ol className="ponte-config__passos">
              <li>Conecte o celular no <strong>Wi-Fi do estabelecimento</strong> (o mesmo do caixa).</li>
              <li>Escaneie o QR ao lado com a câmera.</li>
              <li>Salve a página que abrir na tela inicial — é por ela que o pedido sai quando a internet cair.</li>
            </ol>
            {endereco && (
              <>
                <p className="ponte-config__muted" style={{ marginBottom: 6 }}>Ou digite o endereço no celular:</p>
                <div className="ponte-config__endereco">{endereco}</div>
              </>
            )}
          </div>
        </div>
      )}

      {status === "ausente" && (
        <div className="ponte-config__card">
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ marginTop: 0 }}>
              A ponte é um programinha <strong>gratuito</strong> que roda neste computador e faz o pedido do
              celular chegar no caixa e na impressora <strong>mesmo sem internet</strong>.
            </p>
            {/* O que falta aqui é o arquivo — então baixá-lo é a próxima ação,
                e vem antes do passo a passo para ser a coisa mais visível do
                card. Sem endereço configurado no build o botão não existe e o
                passo 1 volta a pedir o arquivo por fora: botão que não leva a
                lugar nenhum é pior que instrução sem botão. */}
            {ENDERECO_DOWNLOAD_PONTE && (
              <a
                href={ENDERECO_DOWNLOAD_PONTE}
                download
                rel="noreferrer"
                className="ponte-config__baixar"
              >
                <LuDownload size={16} /> Baixar o programa da ponte
              </a>
            )}
            <p><strong>Para ligar:</strong></p>
            <ol className="ponte-config__passos">
              <li>
                {ENDERECO_DOWNLOAD_PONTE
                  ? <>Descompacte o <code>KoraPonte.zip</code> que você acabou de baixar — clique nele com o botão direito e escolha <strong>Extrair tudo</strong> — e dê dois cliques no <code>KoraPonte.exe</code> que aparecer.</>
                  : <>Copie o arquivo <code>KoraPonte.exe</code> para este computador e dê dois cliques nele.</>}
              </li>
              <li>No painel que abrir, clique em <strong>Instalar neste computador</strong> — ela passa a abrir sozinha junto com o Windows.</li>
              <li>Volte aqui e ligue a chave <strong>Receber pedidos do celular do garçom neste computador</strong>.</li>
            </ol>
            <p className="ponte-config__muted">
              Não precisa instalar mais nada, nem digitar código ou endereço. O passo a passo
              completo está no arquivo <code>ponte/INSTALACAO.md</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
