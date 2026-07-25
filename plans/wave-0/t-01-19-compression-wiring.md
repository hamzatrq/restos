# T-01-19 — Wire live compressed framing (DEC-SYNC-010)

Ratified in `fdb4efd`. Closes the follow-up filed by `t-01-16-fix-round.md`: the codec
exists and is proven, but nothing chooses to use it.

## Starting point (verified in `packages/sync-protocol/src/messages.ts`)

`encodeCompressed` / `decodeCompressed` exist, are transparent (`decodeCompressed ∘
encodeCompressed` deep-equals the original for every `kind`), and carry a
`ZSTD_c_checksumFlag` content checksum so a corrupted frame fails loudly instead of
decompressing into a schema-valid but *wrong* message. What does not exist is any code
path that decides a given connection should use them. `PROTOCOL.md` says so explicitly:
*"which framing a connection uses is negotiated per-connection at the transport layer —
out of scope, not yet wired."*

## The change

Negotiation follows the pattern `relay_authorized` already set — additive optional fields
under `v: 1`, no version bump:

- `hello` gains `accepts_compression?: boolean` — the client advertising that it can
  decode compressed frames.
- `hello_ack` gains `compression?: "zstd"` — granted **iff both ends opted in**. Absent
  means plain JSON, forever, for that connection.

Both ends then select their codec once per connection from the negotiated value. Applies
to the catch-up path in particular, where the `26 §6.4` transfer budget lives.

## Why opt-in from both ends is the whole design

A peer that does not advertise compression receives plain JSON for the life of the
connection. That makes the negotiation **unable to strand an older device** — the failure
mode where a newly-deployed gateway starts sending frames an un-updated tablet cannot
parse, which in this product means a terminal that silently stops receiving orders. The
`hello`/`hello_ack` handshake is the only place both ends' capabilities are known before
any payload moves, which is why negotiation belongs there and not in a per-message flag.

## Traps

- **Do not infer support from a successful decode.** Sniffing the zstd magic number and
  auto-switching would make the wire format depend on message content rather than on a
  negotiated contract, and a peer that can decode one frame today may not after a rollback.
- **Do not compress before the ack.** `hello` itself must always be plain — it is the
  message that establishes what the peer can read.
- **Keep the checksum on.** It is the only integrity check a zstd frame has; without it a
  single-byte corruption can decompress into a valid-but-wrong message.
- The transcript/golden fixtures pin plain-JSON framing. Compression must be transparent
  to them: same decoded messages, or the fixtures are testing the codec rather than the
  protocol.
