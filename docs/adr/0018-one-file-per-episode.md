# ADR 0018 — One file per episode; transcode in the browser, never split

**Date:** 2026-10-08 · **Status:** accepted · **Supersedes:** ADR 0011 decision 1 (chunked upload)

## Context

ADR 0011 split every episode into ~20–25 minute chunks, transcribed them in parallel and stitched the word timestamps back together. The reasoning was that a 2-hour episode could not fit the 25 MB transcription cap and that a single serial request risked the 300 s function limit.

The first premise was wrong, because it assumed the wrong codec.

Whisper downsamples all input to **16 kHz mono** before transcribing. Anything above that is bytes we pay to move and the model throws away. At 16 kHz mono **Opus** — which the service accepts in an `ogg` container:

| Bitrate | 2-hour episode | Under the 25 MB cap? |
|---|---|---|
| 16 kbps | 13.7 MB | yes |
| 20 kbps | 17.2 MB | yes |
| **24 kbps** | **20.6 MB** | **yes, 4.4 MB spare** |
| 28 kbps | 24.0 MB | barely |
| 32 kbps | 27.5 MB | no |

At 24 kbps the cap permits **2 hours 25 minutes** in a single request, and Opus at that bitrate is transparent for speech.

The second premise also weakens: 7 200 audio-seconds at roughly 160× realtime is about **45 seconds**, well inside the 300 s limit, and the service accepts a **URL** instead of an upload — so the function can hand over a signed storage link and never move the bytes itself.

## Decision

**One audio file per episode, end to end.** The browser transcodes whatever was recorded to 16 kHz mono Opus at 24 kbps and uploads a single object. The server makes a single transcription request against a signed URL for it.

No splitting, no parallel requests, no timestamp stitching, no reassembly.

Chunking survives in exactly one place: a fallback for episodes **over ~2 hours 25 minutes**, which is outside the normal case. Until one appears, that path is a clear refusal naming the real limit, not a half-built mechanism.

### Transcoding: `ffmpeg.wasm`

The browser cannot naively decode a 2-hour file. `decodeAudioData` on a 150 MB MP3 expands to PCM at the source rate — roughly 2.5 GB of `Float32Array` for two hours of 44.1 kHz stereo — and the tab dies.

`ffmpeg.wasm` streams instead of buffering, so memory stays bounded, and one invocation covers the whole job:

```
-i <input> -vn -ac 1 -ar 16000 -c:a libopus -b:a 24k -application voip <output>.ogg
```

It also accepts every container and codec a recording setup is likely to produce, which removes a whole family of "unsupported format" failures that would otherwise be real stories. The cost is a one-off ~30 MB wasm download, cached thereafter, and a transcode that takes minutes rather than seconds on a long file. WebCodecs `AudioEncoder` is faster and is the obvious later optimisation, but its coverage is uneven and it would need a separate demuxer per input format.

## Consequences

- **The highest-risk code in the project is deleted.** Chunk-boundary timestamp offsetting failed *silently*: counts stayed plausible while pointing at the wrong moment in the audio. That entire class of bug no longer has anywhere to live, along with the silence-boundary splitter, the parallel-request orchestration, the per-chunk retry logic, the `chunks` table and the property tests guarding all of it.
- Domain decision D8's requirement that chunk boundaries be invisible to matching becomes trivially satisfied: there are no boundaries.
- One request per episode instead of four to six, so the per-minute request limit stops being a consideration.
- **The upload is one object**, which makes the signed-URL flow of ADR 0008 simpler rather than more complex.
- The transcode moves onto the uploader's machine. On a 2-hour file that is minutes of local CPU with a progress bar — acceptable, and it is work the server would otherwise have to do under a function timeout.
- Audio over ~2h25m is refused with the real number. A fallback exists on paper and is not built until something needs it.
- Storage drops too: 20.6 MB per episode rather than the ~22 MB assumed, so the 1 GB tier holds a few more episodes.
- **Reversal trigger:** if the cap tightens or episodes routinely run past 2h25m, ADR 0011's chunking design is on the record and still correct. It is dormant, not discarded.
