/**
 * Stylesheets are imported for their side effect, not for a value.
 *
 * TypeScript wants a declaration for any imported extension it does not
 * understand. Next's bundler handles the file; this only tells the compiler
 * that importing it is legitimate and yields nothing.
 */
declare module '*.css' {}
