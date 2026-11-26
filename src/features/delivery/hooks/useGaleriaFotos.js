import { useState } from "react";
import { listarFotosDelivery } from "@/features/delivery/dados/deliveryFotos";

// Menu de escolha da foto (enviar nova, escolher da galeria, remover) e o modal
// da galeria com as fotos já enviadas pelo estabelecimento.
//
// `alvoRef` é o elemento da foto: o menu abre colado nele. Bug real que a
// posição resolve: em tela mais baixa ou com o modal rolado, o menu abria fora
// da área visível e parecia "não abrir". O clamp na viewport o mantém inteiro.
export function useGaleriaFotos({ tenantId, alvoRef }) {
  const [menuFotoAberto, setMenuFotoAberto] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const [galeriaFotos, setGaleriaFotos] = useState([]);
  const [galeriaCarregando, setGaleriaCarregando] = useState(false);
  const [galeriaErro, setGaleriaErro] = useState("");

  const fecharMenuFoto = () => setMenuFotoAberto(false);
  const fecharGaleria = () => setGaleriaAberta(false);

  const alternarMenuFoto = () => {
    if (menuFotoAberto) return setMenuFotoAberto(false);
    const r = alvoRef.current?.getBoundingClientRect();
    if (r) {
      const LARG = 210, ALT = 168, M = 8; // dimensões aprox. do menu + margem
      setMenuPos({
        top: Math.max(M, Math.min(r.bottom + 6, window.innerHeight - ALT - M)),
        left: Math.max(M, Math.min(r.left, window.innerWidth - LARG - M)),
      });
    }
    setMenuFotoAberto(true);
  };

  // Abre a galeria e carrega as fotos já enviadas por este estabelecimento.
  const abrirGaleria = async () => {
    setMenuFotoAberto(false);
    setGaleriaAberta(true);
    setGaleriaErro("");
    setGaleriaCarregando(true);
    const { fotos, error } = await listarFotosDelivery(tenantId);
    if (error) {
      setGaleriaErro(error.message || "Não foi possível carregar a galeria.");
      setGaleriaCarregando(false);
      return;
    }
    setGaleriaFotos(fotos);
    setGaleriaCarregando(false);
  };

  return {
    menuFotoAberto, menuPos, alternarMenuFoto, fecharMenuFoto,
    galeriaAberta, galeriaFotos, galeriaCarregando, galeriaErro, abrirGaleria, fecharGaleria,
  };
}
