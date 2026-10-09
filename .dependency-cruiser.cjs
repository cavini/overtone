/**
 * The dependency rule, enforced.
 *
 * Dependencies point inward only: domain knows nothing, use cases know the
 * domain and the ports they declare, adapters know the use cases, and the
 * framework knows the adapters. An architecture that lives only in a document
 * decays within a week — the ORM row type is simply too convenient to pass
 * into a component — so a violation here fails the build rather than waiting
 * for someone to notice it in review.
 *
 * Note: this pins TypeScript to 6.x. dependency-cruiser needs the compiler's
 * API to resolve TypeScript imports, and does not yet support 7.x — without
 * it the cruise silently finds nothing. Keeping the architecture enforceable
 * is worth more than the compiler's major version, since the latter changes
 * nothing about the product. Revisit when support lands.
 */

/** Packages that mean a layer has reached outside itself. */
const FRAMEWORK_PACKAGES = [
  'next', 'next-intl', 'react', 'react-dom',
  'drizzle-orm', '@supabase/[^/]+', 'groq-sdk', '@anthropic-ai/[^/]+',
]

/**
 * Matches both a resolved package (`node_modules/next/server`) and one that
 * is merely imported without being installed (`next/server`). Constraining
 * this by `dependencyTypes` would miss the second case, because an
 * unresolvable import is not typed as `npm` — and that is exactly the case
 * worth catching, since it is what a mistaken import looks like before
 * anyone runs an install.
 */
const FRAMEWORKS = FRAMEWORK_PACKAGES.map(
  (name) => `(^|node_modules/)${name}($|/)`,
)

module.exports = {
  forbidden: [
    {
      name: 'domain-depends-on-nothing',
      comment:
        'The innermost layer. Entities may not reach out to the ports, the ' +
        'use cases, or anything else — if an entity needs something fetched, ' +
        'the use case fetches it and passes it in.',
      severity: 'error',
      from: { path: '^packages/core/src/domain' },
      to: {
        path: '^packages/core/src',
        pathNot: '^packages/core/src/domain',
      },
    },
    {
      name: 'analysis-is-pure',
      comment:
        'The analysis engine is pure functions over plain data. It may use ' +
        'the domain types and nothing else — notably not the ports, because ' +
        'anything it needs (such as the lemma dictionary) is handed to it as ' +
        'an argument.',
      severity: 'error',
      from: { path: '^packages/core/src/analysis' },
      to: {
        path: '^packages/core/src',
        pathNot: '^packages/core/src/(analysis|domain)',
      },
    },
    {
      name: 'ports-only-speak-domain',
      comment:
        'A port is an interface owned by the inner layer, expressed in the ' +
        "domain's own vocabulary. It must not know about its implementors.",
      severity: 'error',
      from: { path: '^packages/core/src/ports' },
      to: {
        path: '^packages/core/src',
        pathNot: '^packages/core/src/(ports|domain)',
      },
    },
    {
      name: 'core-knows-no-framework',
      comment:
        'Nothing in core may import a framework, a database client or a ' +
        'vendor SDK. Those belong to the adapters, which is what made the ' +
        'transcription provider swappable.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'core-does-no-io',
      comment:
        'No filesystem, no network, no crypto, no process. Determinism is a ' +
        'contract here: the same transcript must always produce the same ' +
        'counts. Time and identifiers arrive through their ports.',
      severity: 'error',
      from: { path: '^packages/core/src', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'fakes-stay-out-of-production',
      comment:
        'Only tests may import the test doubles, in any package. A fake ' +
        'reaching production code would be invisible until it shipped.',
      severity: 'error',
      from: {
        path: '^packages/',
        pathNot: '(\\.test\\.ts$|^packages/core/src/testing)',
      },
      to: { path: '^packages/core/src/testing' },
    },
    {
      name: 'core-never-depends-on-an-adapter',
      comment:
        'The dependency rule across package boundaries. An adapter ' +
        'implements a port it does not own; the inner layer must never know ' +
        'which adapter exists.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      // Matches the resolved path, the workspace-linked path, and the bare
      // specifier. The last form is the one that matters: core does not
      // depend on adapters, so such an import never resolves — and an
      // unresolved import keeps its specifier instead of a path, which a
      // path-only rule would quietly miss.
      to: {
        path: [
          '^packages/adapters/',
          '(^|node_modules/)@overtone/adapters($|/)',
        ],
      },
    },
    {
      name: 'adapters-do-not-depend-on-each-other',
      comment:
        'Adapters all sit in the same ring, so one reaching for another is ' +
        'sideways rather than inward. They should meet in the use cases, or ' +
        'share a type through the domain — not couple directly.',
      severity: 'error',
      from: { path: '^packages/(adapters|db)/src' },
      to: {
        path: [
          '^packages/(adapters|db)/src',
          '(^|node_modules/)@overtone/(adapters|db)($|/)',
        ],
        pathNot: '^packages/(adapters|db)/src',
      },
    },
    {
      name: 'no-circular',
      comment:
        'A cycle means two modules are really one, and neither can be ' +
        'understood or tested alone.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Dead modules rot. Delete them or wire them up.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(^|/)tsconfig\\.json$',
          // Config files are read by their tool, not imported by source.
          '(^|/)(vitest|vite)\\.(integration\\.)?config\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Build output, not source.
    exclude: { path: '(^|/)(coverage|dist|\\.turbo)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
