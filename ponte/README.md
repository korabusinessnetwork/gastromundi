# KORA Ponte — pedidos sem internet

Programinha **gratuito** que roda no PC do caixa. Quando a internet cai, o
celular (Palm) continua mandando pedidos pelo **Wi-Fi do estabelecimento** —
o pedido chega no caixa e sai na impressora na hora. Quando a internet
volta, o app do caixa sincroniza tudo sozinho (fila offline).

```
Celular (Wi-Fi) ──► Ponte (PC do caixa) ◄── App do caixa (localhost)
                                │
                                └──► Impressora (pelo app do caixa)
```

## Instalação (uma vez só)

1. **Instale o Node.js** no PC do caixa (grátis): https://nodejs.org — baixe
   a versão LTS e clique em avançar até o fim.
2. Copie a pasta `ponte/` para o PC do caixa (por exemplo em `C:\kora-ponte`).
3. Abra o terminal (Prompt de Comando) nessa pasta e rode:

   ```
   node servidor.js
   ```

4. Vai aparecer algo assim:

   ```
   ┌────────────────────────────────────────────────┐
   │  KORA Ponte — pedidos sem internet             │
   └────────────────────────────────────────────────┘
     No PC do caixa:  http://localhost:8123
     No celular:      http://192.168.0.42:8123/palm?t=a1b2c3...
     Deixe esta janela aberta. Para parar: Ctrl+C.
   ```

**Deixe essa janela aberta** enquanto o caixa estiver funcionando.
Dica: crie um atalho para não precisar digitar o comando todo dia
(no Windows, um arquivo `ponte.bat` com `node servidor.js` dentro da pasta).

## Como usar no dia a dia

- **Com internet**: nada muda. O app do caixa detecta a ponte sozinho e
  mantém o catálogo dela atualizado.
- **No app do caixa**: em *Configurações → Impressão → Pedidos sem Internet*
  aparece o **QR code** — cada celular da equipe escaneia **uma vez** e salva
  o link na tela inicial.
- **Sem internet**: o garçom abre o link salvo (ou escaneia o QR), monta o
  pedido e envia. O pedido chega no caixa e imprime normalmente.

## Perguntas frequentes

**Precisa pagar alguma coisa?** Não. Zero custo, zero certificado, zero
mensalidade — é só o Node.js (grátis) rodando no PC que já existe.

**O celular precisa de internet?** Não — só precisa estar no **mesmo Wi-Fi**
do PC do caixa.

**E se o Wi-Fi cair junto?** A ponte usa a rede local do roteador, que
continua funcionando mesmo sem internet. Se o próprio roteador desligar,
aí não há rede — religue o roteador.

**Qualquer pessoa no Wi-Fi consegue mandar pedido?** Não. O link tem um
**código secreto** (o `?t=...`) que nasce no primeiro uso e fica só no PC
do caixa (`dados/config.json`). Sem o código, a ponte recusa.

**A porta 8123 está ocupada?** Rode com outra porta:
`KORA_PONTE_PORTA=8200 node servidor.js` (e o app do caixa encontra…
não — nesse caso avise o suporte, o app procura a ponte na porta padrão).

**Onde ficam os pedidos?** Em `dados/pedidos.json`, no próprio PC. Pedidos
já confirmados são apagados automaticamente depois de 24 horas.

## Para desenvolvedores

- Zero dependências — só Node puro (`node:http`, `node:fs` etc.).
- Lógica pura em `lib/` com testes (`npx vitest run ponte/lib` na raiz do repo).
- Endpoints: `GET /saude`, `GET /palm`, `GET /catalogo` e `POST /pedido`
  (token), `GET /info`, `POST /snapshot`, `GET /pedidos`,
  `POST /pedidos/confirmar` (só localhost).
- Dados locais em `dados/` (ignorado pelo git).
