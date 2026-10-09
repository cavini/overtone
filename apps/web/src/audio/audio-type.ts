/**
 * The formats the transcriber accepts, by file extension.
 *
 * Keyed by extension rather than by MIME type because the extension is the
 * only thing that is reliably right. Chrome reports `application/octet-stream`
 * for an `.m4a` picked from disk, Safari and Firefox disagree with it and
 * with each other, and a server that trusted `file.type` rejected a perfectly
 * good episode as an unsupported format.
 */
export const ACCEPTED_EXTENSIONS: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  mpga: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
}

/** The types above, for checking what a browser claims. */
const ACCEPTED_TYPES = new Set(Object.values(ACCEPTED_EXTENSIONS))

/**
 * What this file really is, or `undefined` if it is not audio we handle.
 *
 * The extension decides. A declared type is only used to confirm it, which
 * keeps the answer the same in every browser — and keeps the one the server
 * stores identical to the one the page used to measure the duration.
 */
export function audioTypeOf(filename: string, declaredType: string): string | undefined {
  const parts = filename.toLowerCase().split('.')
  const extension = parts.length > 1 ? (parts.at(-1) ?? '') : ''
  const byExtension = ACCEPTED_EXTENSIONS[extension]

  if (byExtension !== undefined) return byExtension

  // No extension to go on. Accept a declared type only if it is one of ours.
  return ACCEPTED_TYPES.has(declaredType) ? declaredType : undefined
}

/** `accept` for the file input, so the picker shows the right files. */
export const FILE_INPUT_ACCEPT: string = [
  ...new Set(Object.values(ACCEPTED_EXTENSIONS)),
  ...Object.keys(ACCEPTED_EXTENSIONS).map((extension) => `.${extension}`),
].join(',')
