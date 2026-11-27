import { useEffect, useMemo, useState, useRef } from "react";
import { logAction } from "@/features/auditoria/dados/logger";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuTrash2, LuPlus, LuTruck, LuLock, LuLockOpen, LuMessageCircle, LuStore, LuZap } from "react-icons/lu";
import {
  carregarConfigDelivery, salvarConfigDelivery, faixaResumo, validarFaixa, formatarCep, temFaixasKm
} from "@/features/delivery/deliveryAdmin";
import MapaRaioEntrega from "./MapaRaioEntrega";
import { geocodificarEndereco, sugerirEnderecos } from "@/features/delivery/delivery";
import { comUid } from "@/lib/uidLista";

// ════════════════════════════════════════════════════════════════
// ABA 3 — Entrega e taxas (config_delivery)
// ════════════════════════════════════════════════════════════════
export default function AbaEntrega({ isAdmin, tenant, currentUser, aviso }) {
  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // modo da taxa: "area" (bairro/CEP) ou "km" (por distância).
  const [modoTaxa, setModoTaxa] = useState("area");

  // endereço do estabelecimento (origem do mapa por km). O texto fica
  // editável aqui; ao "Localizar", geocodifica (Nominatim, grátis) e
  // posiciona o pino — que segue arrastável para o ajuste fino.
  const [enderecoOrigem, setEnderecoOrigem] = useState("");
  const [geocodificando, setGeocodificando] = useState(false);

  // Autocomplete do endereço (Nominatim, grátis): enquanto digita, sugere
  // opções para o dono escolher — sem precisar acertar o endereço exato.
  // Debounce + AbortController respeitam o limite do Nominatim (1 req/s) e
  // descartam buscas obsoletas. O cadeado (config.endereco_origem_bloqueado)
  // trava a escrita depois de salvo: some o autocomplete, o campo vira
  // somente-leitura e o pino para de arrastar — evita mexer na origem sem
  // querer (prevenção de erro > mensagem de erro, Princípio nº 1).
  const [sugestoes,         setSugestoes]         = useState([]);
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);
  const [mostrarSugestoes,  setMostrarSugestoes]  = useState(false);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  // nova faixa em edição
  const [faixaTipo, setFaixaTipo] = useState("bairro");
  const [faixaBairro, setFaixaBairro] = useState("");
  const [faixaCepIni, setFaixaCepIni] = useState("");
  const [faixaCepFim, setFaixaCepFim] = useState("");
  const [faixaKmAte, setFaixaKmAte] = useState("");
  const [faixaTaxa, setFaixaTaxa] = useState("");

  // O motivo da falha fica NA TELA, não num toast que some. Sem ele, uma
  // coluna que o banco ainda não tem deixava esta aba em "Carregando…"
  // para sempre, sem uma palavra sobre o que faltava — e a taxa de entrega
  // simplesmente não abria.
  const [erroConfig, setErroConfig] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      const { data, error } = await carregarConfigDelivery();
      if (!ativo) return;
      setCarregando(false);
      if (error) {
        setErroConfig(error.message || "Não foi possível carregar as configurações.");
        return;
      }
      setErroConfig("");
      const cfg =
        data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] };
      setConfig({ ...cfg, faixas_taxa: comUid(cfg.faixas_taxa ?? []) });
      setEnderecoOrigem(cfg.endereco_origem || "");
      setModoTaxa(temFaixasKm(cfg.faixas_taxa) ? "km" : "area");
    })();
    return () => { ativo = false; };
  }, [tentativa]);

  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const salvar = async (extra) => {
    if (!tenant?.id) return aviso("Estabelecimento não identificado.", "err");
    const alvo = { ...config, ...(extra || {}) };
    setSalvando(true);
    const { data, error } = await salvarConfigDelivery(tenant.id, alvo);
    setSalvando(false);
    if (error) return aviso("Não foi possível salvar.", "err");
    const salvo = data || alvo;
    setConfig({ ...salvo, faixas_taxa: comUid(salvo.faixas_taxa ?? []) });
    logAction(currentUser?.username, "delivery:config", { msg: "Configurações de entrega atualizadas", name: currentUser?.name, role: currentUser?.role });
    aviso("Configurações salvas.", "ok");
  };

  const taxaNum = () => parseFloat(String(faixaTaxa).replace(",", ".")) || 0;

  const addFaixa = () => {
    let nova, erro;
    if (modoTaxa === "km") {
      nova = { tipo: "km", km_ate: parseFloat(String(faixaKmAte).replace(",", ".")) || 0, taxa: taxaNum() };
      erro = "Informe a distância do anel em km (maior que zero).";
    } else if (faixaTipo === "cep") {
      nova = { tipo: "cep", cep_ini: faixaCepIni, cep_fim: faixaCepFim, taxa: taxaNum() };
      erro = "Preencha os dois CEPs (8 dígitos, início ≤ fim).";
    } else {
      nova = { tipo: "bairro", bairro: faixaBairro, taxa: taxaNum() };
      erro = "Informe o nome do bairro.";
    }
    if (!validarFaixa(nova)) return aviso(erro, "err");
    const faixas = [...(config.faixas_taxa || []), nova];
    setFaixaBairro(""); setFaixaCepIni(""); setFaixaCepFim(""); setFaixaKmAte(""); setFaixaTaxa("");
    salvar({ faixas_taxa: faixas });
  };

  const removerFaixa = (idx) => {
    const alvo = faixasVisiveis[idx];
    const faixas = (config.faixas_taxa || []).filter((f) => f !== alvo);
    salvar({ faixas_taxa: faixas });
  };

  // Ao arrastar o pino no mapa, grava a origem do estabelecimento.
  const definirOrigem = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    salvar({ origem_lat: lat, origem_lng: lng });
  };

  // Geocodifica o endereço digitado (Nominatim, grátis) e posiciona o
  // pino. Se o endereço não for encontrado, guarda o texto mesmo assim e
  // pede para arrastar o pino à mão — nunca trava por causa de terceiro.
  const localizarPeloEndereco = async () => {
    const texto = enderecoOrigem.trim();
    if (!texto) {
      // Limpou o endereço: apaga só o texto, mantém o pino onde está.
      salvar({ endereco_origem: null });
      return;
    }
    setGeocodificando(true);
    const { data } = await geocodificarEndereco(texto);
    setGeocodificando(false);
    if (data) {
      salvar({ endereco_origem: texto, origem_lat: data.lat, origem_lng: data.lng });
      aviso("Endereço localizado no mapa. Arraste o pino se quiser ajustar.", "ok");
    } else {
      salvar({ endereco_origem: texto });
      aviso("Não encontramos esse endereço. Ele foi salvo, marque o ponto arrastando o pino no mapa.", "err");
    }
  };

  // Autocomplete: a cada letra (com debounce) busca sugestões no Nominatim.
  // AbortController cancela a busca anterior para não pintar resultado velho.
  const aoDigitarEndereco = (valor) => {
    setEnderecoOrigem(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const texto = valor.trim();
    if (texto.length < 4) {
      setSugestoes([]); setMostrarSugestoes(false); setBuscandoSugestoes(false);
      return;
    }
    setBuscandoSugestoes(true);
    setMostrarSugestoes(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const { data } = await sugerirEnderecos(texto, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setSugestoes(data || []);
      setBuscandoSugestoes(false);
    }, 450);
  };

  // Operador escolheu uma opção da lista: preenche o campo, posiciona o pino
  // e salva de uma vez — não precisa clicar em "Localizar".
  const escolherSugestao = (s) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setEnderecoOrigem(s.nome);
    setSugestoes([]); setMostrarSugestoes(false); setBuscandoSugestoes(false);
    salvar({ endereco_origem: s.nome, origem_lat: s.lat, origem_lng: s.lng });
    aviso("Endereço marcado no mapa. Arraste o pino se quiser ajustar.", "ok");
  };

  // Cadeado: depois de salvo, trava a escrita do endereço (e o pino do mapa).
  // Alterna o flag e persiste — some o autocomplete, o campo fica só-leitura.
  const alternarBloqueio = () => {
    const proximo = !config?.endereco_origem_bloqueado;
    setSugestoes([]); setMostrarSugestoes(false);
    salvar({ endereco_origem_bloqueado: proximo });
    aviso(proximo ? "Endereço bloqueado para edição." : "Endereço liberado para edição.", "ok");
  };

  // origem e aneisKm são PROPS do mapa (Leaflet). Memoizados por valor para
  // manter a referência estável entre renders — sem isso, cada re-render do
  // AbaEntrega (digitar, salvar, tick do pai) recria os objetos, o efeito do
  // mapa dispara e o fitBounds re-enquadra o mapa "toda hora". Só mudam quando
  // as coordenadas ou as faixas realmente mudam.
  // IMPORTANTE: estes hooks ficam ANTES do early-return de carregamento. Hook
  // depois de um `return` condicional viola as Regras dos Hooks — quando
  // `carregando` deixa de valer, o número de hooks aumenta entre renders
  // (React #310: "rendered more hooks than during the previous render").
  // Por isso usam `config?.` (config é null enquanto carrega).
  const aneisKm = useMemo(
    () => (config?.faixas_taxa || []).filter((f) => f?.tipo === "km"),
    [config?.faixas_taxa]
  );
  const origem = useMemo(
    () =>
      Number.isFinite(Number(config?.origem_lat)) && Number.isFinite(Number(config?.origem_lng))
        ? { lat: Number(config.origem_lat), lng: Number(config.origem_lng) }
        : null,
    [config?.origem_lat, config?.origem_lng]
  );

  if (carregando) {
    return <div className="delivery-view__carregando delivery-view__carregando--bloco">Carregando…</div>;
  }

  if (erroConfig || !config) {
    // Coluna que o banco ainda não tem é o caso mais comum aqui, e o
    // Postgres diz isso com todas as letras ("column ... does not exist").
    // Repassar o texto dele é o que transforma "não funciona" em "faltou
    // rodar a migração" sem ninguém precisar abrir o console.
    const faltaColuna = /column .* does not exist/i.test(erroConfig);
    return (
      <div className="delivery-view__aviso delivery-view__aviso--erro">
        <div>Não foi possível carregar a configuração de entrega.</div>
        {erroConfig && <div className="delivery-view__hint">{erroConfig}</div>}
        {faltaColuna && (
          <div className="delivery-view__hint">
            O banco está atrás do sistema: falta rodar as migrações pendentes
            (supabase/APLICAR_MIGRACOES_PENDENTES.sql) no SQL Editor do Supabase.
          </div>
        )}
        <button
          type="button"
          onClick={() => setTentativa((n) => n + 1)}
          className="delivery-view__btn delivery-view__btn--sm"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const readOnly = !isAdmin;
  const bloqueado = !!config?.endereco_origem_bloqueado;

  // Só as faixas do modo atual aparecem na lista (não misturar — "só km").
  const faixasVisiveis = (config.faixas_taxa || []).filter((f) =>
    modoTaxa === "km" ? f?.tipo === "km" : f?.tipo !== "km"
  );

  return (
    <div className="delivery-view__entrega">
      {/* Pedido mínimo + tempo de preparo */}
      <div className="delivery-view__entrega-basico">
        <div className="delivery-view__campo delivery-view__campo--metade">
          <label className="delivery-view__label">Pedido mínimo (R$)</label>
          <input className="delivery-view__input" type="number" min="0" step="0.01" value={config.pedido_minimo ?? 0} disabled={readOnly} onChange={(e) => set({ pedido_minimo: e.target.value })} onBlur={() => salvar()} />
        </div>
        <div className="delivery-view__campo delivery-view__campo--metade">
          <label className="delivery-view__label">Tempo de preparo (min)</label>
          <input className="delivery-view__input" type="number" min="0" value={config.tempo_preparo_min ?? 30} disabled={readOnly} onChange={(e) => set({ tempo_preparo_min: e.target.value })} onBlur={() => salvar()} />
        </div>
      </div>

      {/* Retirada no local — vem ANTES da taxa de propósito: é o caminho
          que não depende de faixa nenhuma configurada, e quem está abrindo
          a loja hoje consegue vender por ele antes de desenhar as áreas
          de entrega. */}
      <div className="delivery-view__retirada">
        <label className="delivery-view__switch">
          <span>
            <span className="delivery-view__entrega-titulo">
              <LuStore size={16} color={varColor(C.accent)} /> Retirada no local
            </span>
            <span className="delivery-view__hint delivery-view__retirada-hint">
              O cliente escolhe buscar no balcão e não paga taxa. Aparece como opção
              na página do cardápio.
            </span>
          </span>
          <span className="delivery-view__toggle">
            <input
              type="checkbox"
              checked={!!config.permite_retirada}
              disabled={readOnly}
              onChange={(e) => salvar({ permite_retirada: e.target.checked })}
            />
            <span className="delivery-view__toggle-trilho" aria-hidden="true">
              <span className="delivery-view__toggle-botao" />
            </span>
          </span>
        </label>

        {/* Ligado sem endereço, o cliente leria "retire no local" sem saber
            onde é o local — então o servidor não oferece a opção e aqui a
            tela diz por quê, em vez de o dono achar que ligou e não ligou. */}
        {config.permite_retirada && !String(config.endereco_origem || "").trim() && (
          <div className="delivery-view__hint delivery-view__hint--erro">
            Falta o endereço do estabelecimento: sem ele a retirada não aparece
            para o cliente. Preencha em “Endereço do estabelecimento”, no modo de
            taxa por distância.
          </div>
        )}
        {config.permite_retirada && String(config.endereco_origem || "").trim() && (
          <div className="delivery-view__hint">
            O cliente vai buscar em: <strong>{config.endereco_origem}</strong>
          </div>
        )}
      </div>

      {/* Aceite automático de pedidos */}
      <div className="delivery-view__retirada">
        <label className="delivery-view__switch">
          <span>
            <span className="delivery-view__entrega-titulo">
              <LuZap size={16} color={varColor(C.accent)} /> Aceitar pedidos automaticamente
            </span>
            <span className="delivery-view__hint delivery-view__retirada-hint">
              O pedido já entra em <strong>Em preparo</strong>, sem alguém precisar
              apertar &quot;Aceitar&quot;. Para cozinha que faz tudo o que entra.
            </span>
          </span>
          <span className="delivery-view__toggle">
            <input
              type="checkbox"
              checked={!!config.aceite_automatico}
              disabled={readOnly}
              onChange={(e) => salvar({ aceite_automatico: e.target.checked })}
            />
            <span className="delivery-view__toggle-trilho" aria-hidden="true">
              <span className="delivery-view__toggle-botao" />
            </span>
          </span>
        </label>
        {config.aceite_automatico && (
          <div className="delivery-view__hint">
            Você continua podendo cancelar um pedido. O que muda é que ninguém
            precisa estar olhando a tela para ele começar a ser feito. O aviso
            sonoro de pedido novo continua tocando igual.
          </div>
        )}
      </div>

      {/* Confirmação no WhatsApp ao aceitar o pedido */}
      <div className="delivery-view__retirada">
        <label className="delivery-view__switch">
          <span>
            <span className="delivery-view__entrega-titulo">
              <LuMessageCircle size={16} color={varColor(C.accent)} /> Confirmar no WhatsApp
            </span>
            <span className="delivery-view__hint delivery-view__retirada-hint">
              Ao aceitar um pedido e ao marcar que saiu para entrega, abre o
              WhatsApp do cliente com a mensagem já escrita, você confere e
              envia. Grátis, sem integração.
            </span>
          </span>
          <span className="delivery-view__toggle">
            <input
              type="checkbox"
              checked={!!config.whatsapp_no_aceite}
              disabled={readOnly}
              onChange={(e) => salvar({ whatsapp_no_aceite: e.target.checked })}
            />
            <span className="delivery-view__toggle-trilho" aria-hidden="true">
              <span className="delivery-view__toggle-botao" />
            </span>
          </span>
        </label>
        {config.whatsapp_no_aceite && (
          <div className="delivery-view__hint">
            Abre uma aba a cada aceite e a cada saída para entrega. Se você move
            vários de uma vez, talvez prefira deixar desligado. O botão do
            WhatsApp no cartão do pedido continua ali para mandar quando quiser.
          </div>
        )}
      </div>

      {/* Taxa de entrega */}
      <div>
        <div className="delivery-view__entrega-titulo">
          <LuTruck size={16} color={varColor(C.accent)} /> Taxa de entrega
        </div>

        {/* Seletor de modo: por área (bairro/CEP) ou por distância (km) */}
        {isAdmin && (
          <div className="delivery-view__entrega-modos">
            {[
              { id: "area", label: "Por bairro / CEP" },
              { id: "km", label: "Por distância (km)" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setModoTaxa(m.id)}
                className={`delivery-view__btn delivery-view__btn--sm delivery-view__entrega-modo${modoTaxa === m.id ? " delivery-view__entrega-modo--ativo" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="delivery-view__hint delivery-view__hint--taxa">
          {modoTaxa === "km"
            ? "Marque no mapa de onde você entrega e crie anéis por distância (ex.: até 2 km R$ 5, até 5 km R$ 8). Fora do maior anel, o cliente não consegue pedir."
            : "Cobre por bairro ou por faixa de CEP. Quem estiver fora de todas as faixas não consegue pedir para entrega."}
        </div>

        {/* Mapa visual (só no modo por distância) */}
        {modoTaxa === "km" && (
          <div className="delivery-view__entrega-mapa">
            {/* Endereço do estabelecimento → origem do mapa */}
            <div className="delivery-view__campo delivery-view__campo--endereco">
              <label className="delivery-view__label">
                Endereço do estabelecimento (ponto de partida das entregas)
              </label>
              <div className="delivery-view__endereco-linha">
                {/* wrapper relativo: a lista de sugestões flutua abaixo do input */}
                <div className="delivery-view__autocomplete delivery-view__autocomplete--endereco">
                  <input
                    className="delivery-view__input"
                    type="text"
                    placeholder="Rua, número, bairro, cidade"
                    value={enderecoOrigem}
                    disabled={readOnly || bloqueado || geocodificando}
                    autoComplete="off"
                    onChange={(e) => aoDigitarEndereco(e.target.value)}
                    onFocus={() => { if (sugestoes.length) setMostrarSugestoes(true); }}
                    onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !readOnly && !bloqueado) { setMostrarSugestoes(false); localizarPeloEndereco(); }
                      if (e.key === "Escape") setMostrarSugestoes(false);
                    }}
                  />
                  {!readOnly && !bloqueado && mostrarSugestoes && (
                    <ul className="delivery-view__sugestoes">
                      {buscandoSugestoes && sugestoes.length === 0 && (
                        <li className="delivery-view__sugestao-vazia">Buscando endereços…</li>
                      )}
                      {!buscandoSugestoes && sugestoes.length === 0 && (
                        <li className="delivery-view__sugestao-vazia">Nenhum endereço encontrado.</li>
                      )}
                      {sugestoes.map((s, i) => (
                        <li key={`${s.lat},${s.lng},${i}`}>
                          <button
                            type="button"
                            className="delivery-view__sugestao"
                            // onMouseDown (não onClick) para disparar antes do onBlur do input
                            onMouseDown={(e) => { e.preventDefault(); escolherSugestao(s); }}
                          >
                            {s.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {!readOnly && !bloqueado && (
                  <button
                    onClick={localizarPeloEndereco}
                    disabled={geocodificando}
                    className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--primario delivery-view__btn--localizar"
                  >
                    {geocodificando ? "Localizando…" : "Localizar no mapa"}
                  </button>
                )}

                {/* Cadeado: trava a escrita do endereço depois de salvo */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={alternarBloqueio}
                    className={`delivery-view__cadeado${bloqueado ? " delivery-view__cadeado--travado" : ""}`}
                    title={bloqueado ? "Endereço bloqueado, toque para liberar a edição" : "Bloquear edição do endereço"}
                    aria-label={bloqueado ? "Liberar edição do endereço" : "Bloquear edição do endereço"}
                    aria-pressed={bloqueado}
                  >
                    {bloqueado ? <LuLock size={18} /> : <LuLockOpen size={18} />}
                  </button>
                )}
              </div>
              {!readOnly && (
                <div className="delivery-view__hint delivery-view__hint--campo">
                  {bloqueado
                    ? "Endereço bloqueado. Toque no cadeado para liberar a edição."
                    : "Comece a digitar e escolha uma sugestão, o pino vai para lá. Você ainda pode arrastá-lo para o ajuste fino, ou travar com o cadeado."}
                </div>
              )}
            </div>

            <MapaRaioEntrega
              origem={origem}
              aneis={aneisKm}
              onOrigemChange={definirOrigem}
              readOnly={readOnly || bloqueado}
            />
            {!origem && (
              <div className="delivery-view__hint delivery-view__hint--erro">
                Marque o ponto de partida no mapa, sem ele o cálculo por distância não funciona.
              </div>
            )}
          </div>
        )}

        <div className="delivery-view__faixas">
          {faixasVisiveis.length === 0 && (
            <div className="delivery-view__hint">Nenhuma faixa cadastrada ainda.</div>
          )}
          {faixasVisiveis.map((f, idx) => (
            <div key={f.uid} className="delivery-view__faixa">
              <span className="delivery-view__faixa-texto">{faixaResumo(f)}</span>
              {isAdmin && (
                <button onClick={() => removerFaixa(idx)} className="delivery-view__modal-fechar">
                  <LuTrash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="delivery-view__faixa-nova">
            {modoTaxa === "area" && (
              <div className="delivery-view__faixa-tipos">
                {["bairro", "cep"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setFaixaTipo(t)}
                    className={`delivery-view__btn delivery-view__btn--sm delivery-view__faixa-tipo${faixaTipo === t ? " delivery-view__faixa-tipo--ativo" : ""}`}
                  >
                    {t === "bairro" ? "Por bairro" : "Por CEP"}
                  </button>
                ))}
              </div>
            )}
            <div className="delivery-view__faixa-campos">
              {modoTaxa === "km" ? (
                <input className="delivery-view__input delivery-view__input--faixa" type="number" min="0" step="0.1" value={faixaKmAte} onChange={(e) => setFaixaKmAte(e.target.value)} placeholder="Até quantos km" />
              ) : faixaTipo === "bairro" ? (
                <input className="delivery-view__input delivery-view__input--faixa" value={faixaBairro} onChange={(e) => setFaixaBairro(e.target.value)} placeholder="Bairro" maxLength={60} />
              ) : (
                <>
                  <input className="delivery-view__input delivery-view__input--faixa-cep" value={formatarCep(faixaCepIni)} onChange={(e) => setFaixaCepIni(e.target.value)} placeholder="CEP inicial" />
                  <input className="delivery-view__input delivery-view__input--faixa-cep" value={formatarCep(faixaCepFim)} onChange={(e) => setFaixaCepFim(e.target.value)} placeholder="CEP final" />
                </>
              )}
              <input className="delivery-view__input delivery-view__input--taxa" type="number" min="0" step="0.01" value={faixaTaxa} onChange={(e) => setFaixaTaxa(e.target.value)} placeholder="Taxa R$" />
              <button onClick={addFaixa} disabled={salvando} className="delivery-view__btn delivery-view__btn--primario delivery-view__btn--add-faixa">
                <LuPlus size={14} /> Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
