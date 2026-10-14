import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      /*
       * Two modules are left out, both of which are a single call into the
       * platform with no decision in them: `main.ts` reads the environment
       * and assembles everything, and `spawn-program.ts` is the wrapper
       * around `child_process.spawn` that every other module takes as an
       * argument so it can be tested without starting a process. Covering
       * them would mean a unit test that downloads a file or runs ffmpeg,
       * which is exactly what the seams exist to avoid.
       */
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/spawn-program.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
})
