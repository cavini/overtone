# Attribution

## Lemma dictionary

Portuguese lemmatisation data from **[Lemmatization Lists](https://github.com/michmech/lemmatization-lists)** by Michal Měchura, available under the **[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)**. The Portuguese list derives upstream from Hunspell dictionaries published via OpenOffice.org.

This is what lets Overtone know that *falar*, *falei*, *falando* and *falou* are the same word, and — just as importantly — that *casa* and *casar* are not. No stemmer can tell those apart.

**What the licence requires of us**

- This notice, reachable by anyone using the app.
- The word list, and any modified version of it we publish, stays under ODbL.

It places no condition on Overtone's own source code: ODbL governs the database, not software that queries it.

**What we changed**

The list is loaded as-is apart from three transformations, all in `packages/adapters/src/lemmas`:

1. Both sides are normalised to NFC and lower case, with diacritics preserved, so lookups match the analysis pipeline.
2. Rows with no letters on either side are dropped. The published file's first row maps a word to `00`.
3. 213 identity rows are **added**, for lemmas the fallback stemmer would otherwise corrupt. `país` appears in the list only as the lemma of `países`; without an entry of its own it would have been counted as `paí`.

Roughly 824,978 of the original 850,264 pairs are kept.

**A known limitation**

The list maps a spelling to a lemma with no part-of-speech disambiguation, so a form that belongs to two different verbs gets one of them arbitrarily. `aposto` — "I bet" — resolves to `apor` ("to append") rather than `apostar`. Occasional and visible rather than silent: the UI shows the spellings that were folded into a term, so a wrong grouping can be spotted and split with an alias. Worth knowing it exists.

## Transcription

Speech recognition by **Whisper** (`whisper-large-v3-turbo`), served by [Groq](https://groq.com). Transcripts are produced from audio uploaded by the people who recorded it.
