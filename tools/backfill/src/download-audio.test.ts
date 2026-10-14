// Pulling the episode off the podcast host.
//
// With curl rather than `fetch`, which is not a preference — see the module.
// No process is started here: the way of starting one is an argument.
import { describe, expect, it } from 'vitest'
import { downloadAudio } from './download-audio.js'
import type { Program, ProgramEnd, StartProgram } from './spawn-program.js'

interface Started {
  readonly command: string
  readonly args: readonly string[]
}

const stub = (end: ProgramEnd | Error): { start: StartProgram; started: Started[] } => {
  const started: Started[] = []

  const start: StartProgram = (command, args): Program => {
    started.push({ command, args })

    return {
      stdout: (async function* () {})(),
      done: end instanceof Error ? Promise.reject(end) : Promise.resolve(end),
    }
  }

  return { start, started }
}

const ok: ProgramEnd = { code: 0, stderr: '' }

describe('downloadAudio', () => {
  it('writes the url to the path it was given', async () => {
    const { start, started } = stub(ok)

    await downloadAudio('https://cdn.example/ep.mp3', '/tmp/chuva-de-canivetes-001.mp3', start)

    expect(started[0]?.command).toBe('curl')
    expect(started[0]?.args).toContain('https://cdn.example/ep.mp3')
    expect(started[0]?.args.join(' ')).toContain('--output /tmp/chuva-de-canivetes-001.mp3')
  })

  /*
   * Podcast audio sits behind a CDN and arrives via a redirect, so
   * following them is not optional. `--fail` matters just as much: without
   * it curl writes the error page to the output file and exits 0, and what
   * reaches the decoder is a few hundred bytes of HTML.
   */
  it('follows redirects and treats an error page as an error', async () => {
    const { start, started } = stub(ok)

    await downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)

    expect(started[0]?.args).toContain('--location')
    expect(started[0]?.args).toContain('--fail')
  })

  it('retries, because this runs for days unattended', async () => {
    const { start, started } = stub(ok)

    await downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)

    expect(started[0]?.args.join(' ')).toContain('--retry')
  })

  it('says what curl complained about', async () => {
    const { start } = stub({ code: 22, stderr: 'curl: (22) The requested URL returned error: 404' })

    await expect(downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)).rejects.toThrow(
      /404/u,
    )
  })

  it('names the episode url in the failure, not just the code', async () => {
    const { start } = stub({ code: 6, stderr: 'could not resolve host' })

    await expect(downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)).rejects.toThrow(
      /cdn\.example/u,
    )
  })

  // curl ships with macOS, so this is unlikely — but a rejected `done` must
  // not surface as an unhandled rejection in a days-long run.
  it('says so when curl itself is missing', async () => {
    const { start } = stub(Object.assign(new Error('spawn curl ENOENT'), { code: 'ENOENT' }))

    await expect(downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)).rejects.toThrow(
      /curl/u,
    )
  })
})

describe('a download that failed silently', () => {
  // curl says nothing on some failures. "exited 7" is not much, but it is
  // the difference between a reason and an empty line in a day-long log.
  it('reports the exit code when curl said nothing at all', async () => {
    const { start } = stub({ code: 7, stderr: '' })

    await expect(downloadAudio('https://cdn.example/ep.mp3', '/tmp/ep.mp3', start)).rejects.toThrow(
      /exited 7/u,
    )
  })
})
