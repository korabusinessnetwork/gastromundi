// Onde o dono baixa a Ponte KORA — o mesmo `KoraPonte.exe` que faz a térmica
// imprimir (Configurações → Impressão) e que recebe o pedido do celular sem
// internet (aba "Pedidos sem Internet"). As duas telas sempre mandaram "dê
// dois cliques no KoraPonte.exe" sem nunca dizer de onde vem esse arquivo:
// quem não recebeu o instalador por fora ficava preso nas duas.
//
// O endereço vem do ambiente porque o arquivo tem ~56 MB (não entra no
// repositório) e cada instalação pode servi-lo de um lugar — nada de URL fixa
// no código. Mora aqui, e não em cada tela, para as duas nunca discordarem:
// mesmo endereço, mesma checagem.
//
// Só http(s) passa: endereço vazio ou escrito errado no build não pode virar
// um botão que leva a lugar nenhum (nem a um `javascript:`) — sem endereço
// válido o botão simplesmente não existe e a tela segue como era antes.
export const ENDERECO_DOWNLOAD_PONTE =
  /^https?:\/\//i.test(import.meta.env.VITE_PONTE_DOWNLOAD_URL ?? "")
    ? import.meta.env.VITE_PONTE_DOWNLOAD_URL
    : "";
