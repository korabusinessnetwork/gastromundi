# Mapa de fluxos

Projeto: <nome>
Última passada: <data> | fontes usadas: navegação, rotas, endpoints, banco, docs
Total de fluxos: <n> (alta: <n> | média: <n> | baixa: <n>)

> Regra: ID nunca é renumerado. Fluxo difícil de testar entra aqui do mesmo jeito e sai com status NAO_TESTADO.

## <área>

```
F01 | área: <área> | ator: <papel> | criticidade: alta|média|baixa
  objetivo: <uma frase, do ponto de vista do usuário>
  entrada: <estado e dado de partida, do seed de QA>
  passos: <caminho curto e literal>
  esperado: <resultado observável, inclusive efeitos colaterais>
  variações: <a | b | c>
  origem: <navegação | arquivo | endpoint | policy>
```

## Fluxos sem tela

```
F90 | área: jobs | ator: sistema | criticidade: alta
  objetivo: <job, webhook, migration, política de RLS>
  entrada: <como disparar localmente>
  esperado: <efeito verificável no banco ou na fila>
  variações: <execução dupla | payload inválido | falha do serviço externo>
  origem: <arquivo ou agendamento>
```
