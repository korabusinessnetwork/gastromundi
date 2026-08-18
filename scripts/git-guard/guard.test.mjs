import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validarBranch, alvosDoComando } from './guard.mjs'

// A identidade vem de KORA_DEV (ou de `git config kora.dev` na máquina do dev).
// Fixamos aqui para o teste não depender de como cada máquina está configurada.
beforeEach(() => {
  process.env.KORA_DEV = 'bonato'
  delete process.env.KORA_ALLOW_ANY_BRANCH
})

afterEach(() => {
  delete process.env.KORA_DEV
  delete process.env.KORA_ALLOW_ANY_BRANCH
})

describe('validarBranch', () => {
  it('libera a própria branch', () => {
    expect(validarBranch('bonato/pdv-sangria').ok).toBe(true)
  })

  it('bloqueia branch de outra pessoa', () => {
    const r = validarBranch('matheus/relatorio')
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('não é sua')
  })

  it('bloqueia branch sem prefixo de nome', () => {
    expect(validarBranch('feature-solta').ok).toBe(false)
  })

  it('não confunde prefixo parecido com o próprio nome', () => {
    expect(validarBranch('bonatoX/nao-e-sua').ok).toBe(false)
  })

  it.each(['main', 'master'])('bloqueia commit direto em %s', (branch) => {
    const r = validarBranch(branch)
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('protegida')
  })

  it('libera branches de sessão do Claude Code', () => {
    expect(validarBranch('claude/kora-pautas-system-e7fyuy').ok).toBe(true)
  })

  it('aceita o ref completo vindo do hook pre-push', () => {
    expect(validarBranch('refs/heads/bonato/x').ok).toBe(true)
    expect(validarBranch('refs/heads/matheus/x').ok).toBe(false)
  })

  it('o escape de emergência libera branch de outra pessoa', () => {
    process.env.KORA_ALLOW_ANY_BRANCH = '1'
    expect(validarBranch('matheus/relatorio').ok).toBe(true)
  })

  it('o escape de emergência NÃO libera a main', () => {
    process.env.KORA_ALLOW_ANY_BRANCH = '1'
    expect(validarBranch('main').ok).toBe(false)
  })
})

describe('alvosDoComando', () => {
  const atual = 'bonato/x'

  it('reconhece commit no meio de um comando composto', () => {
    expect(alvosDoComando('git add . && git commit -m "ok"', atual)).toEqual([
      { operacao: 'commit', branch: atual },
    ])
  })

  it('reconhece push sem argumentos como push da branch atual', () => {
    expect(alvosDoComando('git push', atual)).toEqual([{ operacao: 'push', branch: atual }])
  })

  it('lê o destino explícito do push', () => {
    expect(alvosDoComando('git push origin HEAD:main', atual)).toEqual([
      { operacao: 'push', branch: 'main' },
    ])
  })

  it('atravessa opções globais do git', () => {
    expect(alvosDoComando('git -C /repo commit --amend', atual)).toHaveLength(1)
  })

  it.each([['git status'], ['git log --oneline --grep=commit'], ['npm test']])(
    'ignora comando que não commita nem empurra: %s',
    (cmd) => {
      expect(alvosDoComando(cmd, atual)).toEqual([])
    },
  )

  it.each([['echo "rode git commit depois"'], ["echo 'git push -u origin main'"]])(
    'ignora git dentro de aspas: %s',
    (cmd) => {
      expect(alvosDoComando(cmd, atual)).toEqual([])
    },
  )

  it('ignora o corpo de um heredoc (é texto, não comando)', () => {
    const cmd = ["cat > DOC.md <<'EOF'", 'git push -u origin bonato/x', 'EOF', 'echo pronto'].join('\n')
    expect(alvosDoComando(cmd, atual)).toEqual([])
  })

  it('ainda pega o comando real depois do heredoc', () => {
    const cmd = ["cat > DOC.md <<'EOF'", 'texto', 'EOF', 'git commit -m "de verdade"'].join('\n')
    expect(alvosDoComando(cmd, atual)).toEqual([{ operacao: 'commit', branch: atual }])
  })
})

describe('alvosDoComando com redirecionamento', () => {
  const atual = 'bonato/x'

  it('não confunde 2>&1 com nome de branch', () => {
    expect(alvosDoComando('git push -u origin bonato/x 2>&1 | tail -5', atual)).toEqual([
      { operacao: 'push', branch: 'bonato/x' },
    ])
  })

  it('ignora arquivo de saída como se fosse branch', () => {
    expect(alvosDoComando('git push origin bonato/x > /tmp/log.txt', atual)).toEqual([
      { operacao: 'push', branch: 'bonato/x' },
    ])
  })

  it('continua vendo o commit com redirecionamento junto', () => {
    expect(alvosDoComando('git commit -m "ok" >saida.txt 2>&1', atual)).toEqual([
      { operacao: 'commit', branch: atual },
    ])
  })

  it('push sem refspec e com redirecionamento cai na branch atual', () => {
    expect(alvosDoComando('git push 2>&1', atual)).toEqual([{ operacao: 'push', branch: atual }])
  })
})
