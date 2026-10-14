import { spawn } from 'node:child_process'

/**
 * Starting another program, behind a seam.
 *
 * Two things this tool does are somebody else's program: ffmpeg decodes the
 * audio, and curl downloads it. Both are injected rather than called
 * directly so that the modules around them can be tested without a process
 * — including the paths that matter most, "ffmpeg is not installed" and
 * "the download failed", which are otherwise only reachable by breaking the
 * machine the tests run on.
 *
 * This file is the real implementation and the only one that touches
 * `child_process`. It has no decisions in it, which is why it is left out of
 * the coverage numbers.
 */

export interface ProgramEnd {
  readonly code: number
  /** Whatever it complained about, which is the only clue a failure gives. */
  readonly stderr: string
}

export interface Program {
  /**
   * The bytes it writes to stdout, as they arrive.
   *
   * Consumed to the end before `done` is awaited: a pipe holds about 64 KB
   * and a program whose output nobody reads blocks forever once it fills.
   */
  readonly stdout: AsyncIterable<Uint8Array>
  /** How it ended. Rejects when the program could not be started at all. */
  readonly done: Promise<ProgramEnd>
}

export type StartProgram = (command: string, args: readonly string[]) => Program

export const spawnProgram: StartProgram = (command, args) => {
  const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })

  let complaint = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (piece: string) => {
    // Only the tail. ffmpeg will happily write a thousand lines about a
    // file it could not read, and the last of them is the reason.
    complaint = `${complaint}${piece}`.slice(-2_000)
  })

  const done = new Promise<ProgramEnd>((finished, failed) => {
    // Before `close`, which never comes when the program does not exist.
    child.on('error', failed)
    child.on('close', (code) => finished({ code: code ?? 0, stderr: complaint.trim() }))
  })

  return { stdout: child.stdout, done }
}
