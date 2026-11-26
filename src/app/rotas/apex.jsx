import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import CarregandoApex from "@/routes/CarregandoApex";

// Superfície do site da Kora (kora.codes). As páginas são lazy: quem opera o
// PDV nos subdomínios nunca baixa esse código, só o visitante do site.
const ApexPage = lazy(() => import("@/pages/apex/ApexPage"));
// Protótipo navegável ("Ver o KORA rodando"), com dados fictícios.
const DemoPage = lazy(() => import("@/pages/apex/demo/DemoPage"));
// Portas do site: "Entrar" pergunta o endereço do estabelecimento e leva ao
// login DELE; "Criar conta" registra o pedido na fila do Console.
const ApexEntrarPage = lazy(() => import("@/pages/apex/ApexEntrarPage"));
const ApexCriarContaPage = lazy(() => import("@/pages/apex/ApexCriarContaPage"));
// Novidades do sistema (kora.codes/patchnotes): o que mudou em cada atualização.
const ApexNotasPage = lazy(() => import("@/pages/apex/ApexNotasPage"));

const noSite = (Pagina) => <Suspense fallback={<CarregandoApex />}><Pagina /></Suspense>;
const paraOLogin = <Navigate to="/login" replace />;

/**
 * Rotas do site da Kora. O site divide o host com os estabelecimentos (o
 * domínio nu e o www), por isso cada rota decide pelo `noApex`: fora do site,
 * comportamento de sempre, direto ao login. A raiz no site mostra a vitrine;
 * `/entrar` existe para a porta da PLATAFORMA não abrir o login de um cliente
 * só (decisão 017); `/criar-conta` não provisiona nada, entra na fila do
 * Console (decisão 027).
 *
 * @param {boolean} noApex - o endereço atual é o do site da Kora
 */
export function rotasApex(noApex) {
  return [
    { path: "/", element: noApex ? noSite(ApexPage) : paraOLogin },
    { path: "/demo", element: noApex ? noSite(DemoPage) : paraOLogin },
    { path: "/entrar", element: noApex ? noSite(ApexEntrarPage) : paraOLogin },
    { path: "/criar-conta", element: noApex ? noSite(ApexCriarContaPage) : paraOLogin },
    { path: "/patchnotes", element: noApex ? noSite(ApexNotasPage) : paraOLogin },
  ];
}
