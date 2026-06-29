import qz from "qz-tray";

let conectado = false;

export async function conectarQZ() {
  if (qz.websocket.isActive()) { conectado = true; return; }
  await qz.websocket.connect();
  conectado = true;
}

export async function desconectarQZ() {
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect();
  }
  conectado = false;
}

export async function listarImpressoras() {
  if (!qz.websocket.isActive()) await conectarQZ();
  return qz.printers.find(); // retorna string[] com nomes das impressoras
}

export async function imprimirBruto(nomePrinter, linhas) {
  if (!qz.websocket.isActive()) await conectarQZ();
  const config = qz.configs.create(nomePrinter);
  const dados = linhas.map(l => ({ type: "raw", format: "plain", data: l + "\n" }));
  await qz.print(config, dados);
}

export { qz };
