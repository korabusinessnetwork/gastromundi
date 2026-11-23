import { useRef } from "react";
import { SessaoProvider } from "./SessaoProvider";
import { OfflineProvider } from "./OfflineProvider";
import { ConfigProvider } from "./ConfigProvider";
import { CatalogoProvider } from "./CatalogoProvider";
import { ComandasProvider } from "./ComandasProvider";
import { CaixaProvider } from "./CaixaProvider";
import { CoordenacaoDaCarga } from "@/app/CoordenacaoDaCarga";

/**
 * A porta do contexto do app (fase 2 do plano de refatoração, ADR-015).
 *
 * Só monta os provedores, cada um dono de um assunto, e a coordenação no
 * centro. As referências abaixo nascem aqui porque são divididas entre a
 * coordenação, que as descobre ou preenche na carga, e os provedores, que as
 * usam. As telas leem pelos ganchos reexportados no fim deste arquivo.
 */
export function AppProvider({ children }) {
  const tenantIdRef = useRef(null);
  // Banco sem a coluna `users.permissions` (migration não aplicada): a carga
  // descobre, as escritas de usuário da sessão obedecem.
  const permsColunaIndisponivelRef = useRef(false);
  // "Recarregar os dados" é a carga da coordenação, lá dentro.
  const recarregarRef = useRef(() => {});
  // Banco sem as colunas da trava de edição (migration não aplicada): a carga
  // descobre, as travas das comandas obedecem.
  const lockIndisponivelRef = useRef(false);
  // De fora para dentro, cada um só depende dos que estão por fora dele. A
  // coordenação (carga, dreno da fila, Jarvas) fica no centro.
  return (
    <SessaoProvider tenantIdRef={tenantIdRef} carregarRef={recarregarRef} permsColunaIndisponivelRef={permsColunaIndisponivelRef}>
      <OfflineProvider tenantIdRef={tenantIdRef} recarregarRef={recarregarRef}>
        <ConfigProvider tenantIdRef={tenantIdRef}>
          <CatalogoProvider>
            <ComandasProvider lockIndisponivelRef={lockIndisponivelRef}>
              <CaixaProvider>
                <CoordenacaoDaCarga
                  tenantIdRef={tenantIdRef}
                  lockIndisponivelRef={lockIndisponivelRef}
                  recarregarRef={recarregarRef}
                  permsColunaIndisponivelRef={permsColunaIndisponivelRef}
                >
                  {children}
                </CoordenacaoDaCarga>
              </CaixaProvider>
            </ComandasProvider>
          </CatalogoProvider>
        </ConfigProvider>
      </OfflineProvider>
    </SessaoProvider>
  );
}

// Movido para o CatalogoProvider na tarefa 2.9; reexportado por causa do teste.
export { aplicarNumeroRemoto } from "./CatalogoProvider";

// Os ganchos de cada assunto (fase 2 do plano de refatoração). As telas
// importam daqui, para continuar existindo uma porta só para o contexto e os
// testes continuarem dublando um módulo só.
export { useSessao } from "./SessaoContext";
export { useOffline } from "./OfflineContext";
export { useConfig } from "./ConfigContext";
export { useCatalogo } from "./CatalogoContext";
export { useComandas } from "./ComandasContext";
export { useCaixa } from "./CaixaContext";
