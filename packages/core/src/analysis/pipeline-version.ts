/**
 * Bumped whenever this pipeline would produce different numbers for the same
 * transcript — a tokeniser change, a new stemming rule, a different stop-word
 * policy.
 *
 * Stored with every analysis so that a count can be traced to the code that
 * produced it, and so re-analysis knows what is stale. Forgetting to bump it
 * leaves old numbers sitting next to new ones with no way to tell them apart.
 */
export const PIPELINE_VERSION = 1
