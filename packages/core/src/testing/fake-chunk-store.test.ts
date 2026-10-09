// US-040 · ADR 0020
import { describeChunkStore } from './chunk-store.contract.js'
import { FakeChunkStore } from './fakes.js'

describeChunkStore('FakeChunkStore', () =>
  Promise.resolve({
    store: new FakeChunkStore(),
    episodeIds: ['episode-a', 'episode-b'],
    reset: () => Promise.resolve(),
  }),
)
