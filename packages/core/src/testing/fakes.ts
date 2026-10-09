import type { AllowanceState } from '../domain/allowance.js'
import type { ChunkTranscript } from '../domain/audio-chunk.js'
import type { EpisodeStatus } from '../domain/episode.js'
import type { AllowanceStore } from '../ports/allowance-store.js'
import type { ChunkStore } from '../ports/chunk-store.js'
import type { Clock } from '../ports/clock.js'
import type {
  EpisodeFailure,
  EpisodeStore,
  StoredAnalysis,
} from '../ports/episode-store.js'
import { DAILY_ALLOWANCE_MS, HOURLY_ALLOWANCE_MS } from '../analysis/pacing.js'

/**
 * Time that does not move unless told to.
 *
 * The allowance windows turn over on exact boundaries, so a clock that
 * advanced on its own would make those boundaries untestable and the counts
 * unreproducible.
 */
export class FixedClock implements Clock {
  constructor(private current: number = 1_800_000_000_000) {}

  now(): number {
    return this.current
  }

  advance(ms: number): this {
    this.current += ms
    return this
  }
}

/** Chunk transcripts in memory, keyed by episode. */
export class FakeChunkStore implements ChunkStore {
  private readonly byEpisode = new Map<string, Map<number, ChunkTranscript>>()

  private forEpisode(episodeId: string): Map<number, ChunkTranscript> {
    const existing = this.byEpisode.get(episodeId)
    if (existing !== undefined) return existing

    const created = new Map<number, ChunkTranscript>()
    this.byEpisode.set(episodeId, created)
    return created
  }

  transcribedIndexes(episodeId: string): Promise<readonly number[]> {
    return Promise.resolve([...this.forEpisode(episodeId).keys()].sort((a, b) => a - b))
  }

  transcripts(episodeId: string): Promise<readonly ChunkTranscript[]> {
    return Promise.resolve(
      [...this.forEpisode(episodeId).values()].sort((a, b) => a.index - b.index),
    )
  }

  save(episodeId: string, chunk: ChunkTranscript): Promise<void> {
    this.forEpisode(episodeId).set(chunk.index, chunk)
    return Promise.resolve()
  }
}

/**
 * An allowance that starts untouched and records what is spent.
 *
 * Generous by default so a test has to opt in to the pacing behaviour it
 * wants to examine, rather than tripping over it.
 */
export class FakeAllowanceStore implements AllowanceStore {
  readonly spent: number[] = []

  constructor(private state: AllowanceState) {}

  static fresh(nowMs: number): FakeAllowanceStore {
    return new FakeAllowanceStore({
      hourlyUsedMs: 0,
      dailyUsedMs: 0,
      hourResetsAt: nowMs + 3_600_000,
      dayResetsAt: nowMs + 86_400_000,
    })
  }

  static exhausted(nowMs: number, window: 'hour' | 'day'): FakeAllowanceStore {
    const fresh = FakeAllowanceStore.fresh(nowMs)
    return new FakeAllowanceStore({
      ...fresh.state,
      hourlyUsedMs: HOURLY_ALLOWANCE_MS,
      dailyUsedMs: window === 'day' ? DAILY_ALLOWANCE_MS : 0,
    })
  }

  read(): Promise<AllowanceState> {
    return Promise.resolve(this.state)
  }

  record(audioMs: number): Promise<void> {
    this.spent.push(audioMs)
    this.state = {
      ...this.state,
      hourlyUsedMs: this.state.hourlyUsedMs + audioMs,
      dailyUsedMs: this.state.dailyUsedMs + audioMs,
    }
    return Promise.resolve()
  }
}

/** An episode store that remembers what it was told, in order. */
export class FakeEpisodeStore implements EpisodeStore {
  readonly statuses: EpisodeStatus[] = []
  readonly failures: EpisodeFailure[] = []
  readonly analyses: StoredAnalysis[] = []

  setStatus(
    _episodeId: string,
    status: EpisodeStatus,
    failure?: EpisodeFailure,
  ): Promise<void> {
    this.statuses.push(status)
    if (failure !== undefined) this.failures.push(failure)
    return Promise.resolve()
  }

  save(_episodeId: string, analysis: StoredAnalysis): Promise<void> {
    this.analyses.push(analysis)
    return Promise.resolve()
  }

  get latest(): StoredAnalysis | undefined {
    return this.analyses.at(-1)
  }
}
