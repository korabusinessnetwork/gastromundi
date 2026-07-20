// ──────────────────────────────────────────────────────────────────
// MapaRaioEntrega — mapa visual com anéis de raio por km (estilo do
// "alcance" de campanha do Instagram). O dono arrasta o pino central
// para marcar a origem do estabelecimento e vê os anéis (cada faixa por
// km) desenhados em volta, com preços diferentes por anel.
//
// Grátis: OpenStreetMap (tiles) + Leaflet, sem chave e sem custo. A
// geocodificação do cliente final é feita à parte (Nominatim, em
// delivery.js); aqui o mapa só posiciona a origem e mostra o alcance.
//
// Leaflet + ícone: os ícones-imagem padrão do Leaflet quebram sob
// bundler; por isso o pino é um divIcon (HTML/CSS, ver .css co-locado,
// decisão 018). O tema do tenant entra via --gm-* (decisão 017).
//
// Intuitividade (Princípio nº 1): "arraste o pino para marcar de onde
// você entrega" é auto-explicativo; os anéis mostram exatamente até onde
// cada preço vale, sem precisar imaginar distância.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LuMapPin } from "react-icons/lu";
import "./MapaRaioEntrega.css";

// Centro-padrão quando ainda não há origem: Brasil (aprox. centro
// geográfico) num zoom bem aberto — só até o dono arrastar o pino.
const CENTRO_PADRAO = [-15.78, -47.93];
const ZOOM_PADRAO = 4;
const ZOOM_COM_ORIGEM = 13;

// Resolve uma variável CSS (--gm-accent) para um valor concreto de cor,
// porque Leaflet aplica a cor como atributo SVG e `var(--x)` não resolve
// nesse contexto. Fallback azul.
function corAccent(el) {
  try {
    const v = getComputedStyle(el).getPropertyValue("--gm-accent").trim();
    return v || "#2563eb";
  } catch {
    return "#2563eb";
  }
}

const pinoIcon = L.divIcon({
  className: "",
  html: '<div class="mapa-raio__pino"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 22],
});

/**
 * @param {object} props
 * @param {{lat:number,lng:number}|null} props.origem - origem atual (ou null)
 * @param {Array<{km_ate:number, taxa:number}>} props.aneis - faixas por km
 * @param {(lat:number,lng:number)=>void} props.onOrigemChange - callback ao mover
 * @param {boolean} props.readOnly - quando true, pino não arrasta
 */
export default function MapaRaioEntrega({ origem, aneis = [], onOrigemChange, readOnly = false }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circlesRef = useRef([]);
  const onChangeRef = useRef(onOrigemChange);
  onChangeRef.current = onOrigemChange;

  const temOrigem =
    origem && Number.isFinite(Number(origem.lat)) && Number.isFinite(Number(origem.lng));

  // Inicializa o mapa uma vez.
  useEffect(() => {
    if (mapRef.current || !boxRef.current) return;
    const centro = temOrigem ? [Number(origem.lat), Number(origem.lng)] : CENTRO_PADRAO;
    const zoom = temOrigem ? ZOOM_COM_ORIGEM : ZOOM_PADRAO;

    const map = L.map(boxRef.current, { attributionControl: true }).setView(centro, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    // Clicar no mapa também marca a origem (além de arrastar o pino).
    if (!readOnly) {
      map.on("click", (e) => {
        onChangeRef.current?.(e.latlng.lat, e.latlng.lng);
      });
    }

    mapRef.current = map;
    // Leaflet precisa recalcular o tamanho quando o container aparece
    // dentro de abas/flex — dá um empurrão no próximo frame.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circlesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redesenha pino + anéis quando origem ou faixas mudam.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpa anéis antigos.
    circlesRef.current.forEach((c) => c.remove());
    circlesRef.current = [];

    if (!temOrigem) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const centro = [Number(origem.lat), Number(origem.lng)];
    const cor = corAccent(boxRef.current);

    // Pino central (arrastável).
    if (!markerRef.current) {
      const marker = L.marker(centro, { icon: pinoIcon, draggable: !readOnly }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current?.(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(centro);
      markerRef.current.dragging?.[readOnly ? "disable" : "enable"]?.();
    }

    // Anéis por km (raio em metros = km * 1000). Do maior pro menor, para
    // o menor ficar por cima e visível.
    const ordenados = [...aneis]
      .filter((f) => Number(f?.km_ate) > 0)
      .sort((a, b) => Number(b.km_ate) - Number(a.km_ate));

    ordenados.forEach((f) => {
      const circ = L.circle(centro, {
        radius: Number(f.km_ate) * 1000,
        color: cor,
        weight: 1.5,
        fillColor: cor,
        fillOpacity: 0.08,
      }).addTo(map);
      circlesRef.current.push(circ);
    });

    // Enquadra o maior anel (ou centraliza no pino se não há anel).
    if (ordenados.length > 0) {
      const maior = circlesRef.current[0];
      map.fitBounds(maior.getBounds(), { padding: [24, 24], maxZoom: 15 });
    } else {
      map.setView(centro, Math.max(map.getZoom(), ZOOM_COM_ORIGEM));
    }
  }, [origem, aneis, temOrigem, readOnly]);

  return (
    <div className="mapa-raio">
      <div ref={boxRef} className="mapa-raio__canvas" />
      <div className="mapa-raio__dica">
        <LuMapPin size={13} />
        {readOnly
          ? "Área de entrega do estabelecimento."
          : temOrigem
          ? "Arraste o pino (ou toque no mapa) para ajustar de onde você entrega."
          : "Toque no mapa para marcar de onde você entrega."}
      </div>
    </div>
  );
}
