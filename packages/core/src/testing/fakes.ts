import type { ObservedAllowance } from '../domain/observed-allowance.js'
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

  constructor(
    private state: AllowanceState,
    private readonly clock: Clock,
  ) {}

  static fresh(clock: Clock): FakeAllowanceStore {
    const nowMs = clock.now()
    return new FakeAllowanceStore(
      {
        remainingAudioMs: HOURLY_ALLOWANCE_MS,
        asOfMs: nowMs,
        dailyUsedMs: 0,
        dayResetsAt: nowMs + 86_400_000,
      },
      clock,
    )
  }

  static exhausted(clock: Clock, window: 'hour' | 'day'): FakeAllowanceStore {
    const fresh = FakeAllowanceStore.fresh(clock)
    return new FakeAllowanceStore(
      {
        ...fresh.state,
        remainingAudioMs: 0,
        dailyUsedMs: window === 'day' ? DAILY_ALLOWANCE_MS : 0,
      },
      clock,
    )
  }

  read(): Promise<AllowanceState> {
    return Promise.resolve(this.state)
  }

  record(audioMs: number, observed?: ObservedAllowance): Promise<void> {
    this.spent.push(audioMs)
    this.state = {
      ...this.state,
      // The provider's reading wins when there is one. Ours is a subtraction
      // from a balance that has also been refilling, so it drifts low.
      remainingAudioMs:
        observed?.remainingAudioMs ?? Math.max(0, this.state.remainingAudioMs - audioMs),
      // Restamped, because the balance is only true at an instant. Leaving
      // the old stamp would let whoever reads this credit refill for the gap
      // *before* the spend, handing back the audio just sent.
      asOfMs: this.clock.now(),
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
