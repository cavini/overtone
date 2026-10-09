// US-040 · ADR 0021
import { describeAllowanceStore } from './allowance-store.contract.js'
import { FakeAllowanceStore } from './fakes.js'

// A real clock, deliberately. The contract reasons about elapsed time, and a
// fixed clock would make the fake agree with itself rather than with the
// behaviour every implementation has to share.
const systemClock = { now: () => Date.now() }

describeAllowanceStore('FakeAllowanceStore', () =>
  Promise.resolve({
    store: FakeAllowanceStore.fresh(systemClock),
    now: () => systemClock.now(),
    reset: () => Promise.resolve(),
  }),
)
