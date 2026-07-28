# Instalação da Ponte KORA

A Ponte KORA permite que os garçons continuem mandando pedidos no celular e as comandas continuem imprimindo mesmo quando a internet cai — desde que o Wi-Fi do estabelecimento funcione.

---

## O que é a Ponte?

Quando a internet vai embora, o sistema fica offline. Mas a Ponte é um pequeno programa que fica rodando no PC do caixa e funciona com o Wi-Fi local. Assim, os celulares dos garçons continuam mandando pedidos e as comandas saem na impressora normalmente — sem internet.

Quando a internet volta, tudo sincroniza automaticamente e volta ao normal.

---

## Como instalar

### 1. Receber o arquivo

O responsável do sistema vai passar um arquivo chamado **`KoraPonte.exe`** — pode ser por e-mail, pendrive ou download. Salve em um lugar que ache fácil (por exemplo, a Área de Trabalho ou a pasta Downloads).

### 2. Executar pela primeira vez

Dê um duplo clique no arquivo `KoraPonte.exe`.

**Vai aparecer um aviso azul do Windows** dizendo "O Windows protegeu o seu computador". Isso é normal — é porque o arquivo ainda não tem uma assinatura digital paga. Não é vírus, é só um aviso.

1. Clique em **Mais informações**.
2. Clique em **Executar assim mesmo**.
3. Pronto. Isso só acontece uma vez.

### 3. Instalar no computador

A Ponte **não abre janela nenhuma** — ela trabalha em segundo plano, como uma impressora que fica ligada. O que abre é o **painel no navegador**. Nele, clique em **Instalar neste computador**.

O programa vai:
- Copiar a Ponte para a pasta do seu usuário (não pede senha).
- Criar um atalho na **Área de Trabalho** para facilitar.
- Criar outro atalho na pasta de **Inicializar** (ela passa a abrir sozinha toda vez que o PC liga).

**Pronto — a Ponte está instalada.**

---

## Como usar no dia a dia

### Ver se a Ponte está ligada

Clique no atalho **"KORA Ponte"** na Área de Trabalho. Ele abre o **painel** no navegador:

- **"Ponte ligada"** — está tudo certo, ela está trabalhando em segundo plano. Pode fechar a aba do navegador à vontade: fechar o painel **não** para a Ponte.
- **"Ponte parada"** — clique no atalho da Área de Trabalho de novo para ligá-la.

Depois que o PC reinicia, ela sobe sozinha, sem abrir nada na tela.

### Parar a Ponte

No fim do painel tem o botão **Parar a ponte**. Ele pergunta *"Tem certeza?"* antes — só o segundo clique para de verdade. Para voltar, use o atalho da Área de Trabalho.

Enquanto o caixa estiver funcionando, o normal é **nunca** parar a Ponte.

---

## Ligar a impressora

Depois de instalar a Ponte, configure qual impressora usar. Abra o sistema e vá para:

**Configurações → Impressão → aba "Layout da comanda"**

1. Em "Como imprimir", escolha **Impressora térmica (Ponte KORA)**.
2. Clique em **Procurar impressoras** — a Ponte vai listar as impressoras disponíveis no PC.
3. Escolha a sua impressora térmica na lista.
4. Clique em **Imprimir teste** para confirmar que está funcionando.

**Pronto — as comandas vão sair na impressora.**

---

## Preparar o celular do garçom

Os celulares dos garçons precisam acessar a Ponte pelo Wi-Fi quando a internet cai. Para isso, é fácil:

1. No sistema, abra: **Configurações → Impressão → aba "Pedidos sem Internet"**.
2. Vai aparecer um **código QR** na tela.
3. Cada garçom escaneia esse código **uma única vez** com o celular dele (pode usar a câmera ou um app de QR).
4. O celular vai salvar um atalho — daí em diante, o garçom abre esse atalho para montar pedidos quando não tiver internet.

**Dica:** Tire uma foto do código QR com o seu celular e guarde. Se precisar mostrar para um novo funcionário, é só abrir a foto e escanear de novo.

---

## Se der problema

**P: Vi o aviso azul e não sei o que fazer**

R: Clique em "Mais informações" e depois "Executar assim mesmo". Isso é normal na primeira vez — o Windows avisa porque o arquivo é novo. Não é vírus.

**P: Cliquei no atalho e não aconteceu nada**

R: Aconteceu sim — a Ponte não tem janela, ela trabalha em segundo plano. O painel deve abrir no navegador em alguns segundos. Se não abrir, digite `localhost:8123` no navegador.

**P: Como sei se ela está mesmo ligada?**

R: Clique no atalho **KORA Ponte** da Área de Trabalho. O painel abre dizendo **"Ponte ligada"** ou **"Ponte parada"**. Fechar a aba do navegador não para a Ponte.

**P: Não está imprimindo a comanda**

R: Verifique:
1. O painel diz "Ponte ligada"? (atalho da Área de Trabalho)
2. A impressora está ligada e tem papel?
3. Você escolheu a impressora certa em "Configurações → Impressão"?

Se tudo estiver OK, reinicie a Ponte: no painel, **Parar a ponte**; depois clique no atalho da Área de Trabalho para abrir de novo e tente imprimir.

**P: O suporte pediu o "log" da Ponte. Onde está?**

R: Aperte as teclas **Windows + R**, cole `%LOCALAPPDATA%\KORA\Ponte\dados` e dê Enter. O arquivo é o **`ponte.log`** — pode mandar por e-mail; ele não guarda senha nem código secreto nenhum.

**P: O painel do sistema não abre**

R: Reinicie o PC. Se continuar, entre em contato com o responsável do sistema.

**P: Cliquei duas vezes no atalho. Abriu duas Pontes?**

R: Não. A segunda percebe que a primeira já está trabalhando e apenas mostra o painel dela. Nunca há duas Pontes ao mesmo tempo.

**P: Apareceu uma página dizendo que a Ponte não conseguiu abrir**

R: É o aviso dela quando algo impediu de subir neste PC (normalmente outro programa ocupando o endereço `8123`). A própria página diz onde fica o arquivo `ponte.log` — mande esse arquivo para o responsável do sistema.

**P: Instalei e abri o sistema, mas não aparece "Vinculada a <nome do estabelecimento>"**

R: Espere alguns segundos — o sistema às vezes demora um pouco para reconhecer. Se não aparecer:
1. Feche o sistema completamente.
2. Clique no atalho da Ponte para garantir que ela está rodando.
3. Abra o sistema de novo.

Se ainda não funcionar, reinicie o PC inteiro (PC do caixa e roteador Wi-Fi também).

---

## Precisa de ajuda?

Se algo não funcionar como descrito acima, anote:
- Qual foi o erro exato que apareceu?
- Quando aconteceu (ao instalar, ao ligar a Ponte, ao imprimir)?
- Qual sistema operacional do PC (Windows 10, Windows 11)?

Passe essa informação para o responsável do sistema — ele consegue ajudar muito melhor sabendo esses detalhes.
