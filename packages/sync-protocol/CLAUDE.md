# @restos/sync-protocol

**Owning spec: `specs/01-kernel-sync.md §8 + 20 §2.7` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Wire types shared by sync-client and sync-gateway; golden fixtures keep the contract from drifting.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map and `PROTOCOL.md` for the wire spec. Golden fixtures pin the wire — changing one is a 20 §2.7 spec-review event.
- **⚠ `messages.ts` MUST NOT import `node:*` again (August 2026).** It did — one line, for the zstd
  framing — and that made the whole package unbundlable for React Native: Metro cannot resolve
  `node:zlib`, so a phone could not reach the message PARSER, let alone a socket. The zstd half now
  lives in `compression.ts` and the root `index.ts` re-exports it under the same names, so **no
  consumer changed**. Two subpaths publish the portable half: `@restos/sync-protocol/messages`
  (schemas, `parseMessage`, `encodeMessage`) and `/transport` (the transport seam types).
- **A TYPE-ONLY import of the package ROOT still loads its module graph**, so `import type { … }
  from "@restos/sync-protocol"` in a file an RN program compiles is enough to break that program on
  `node:zlib`. `sync-client`'s `cloud-session.ts`, `wall-clock.ts` and `transport-rn.ts` use the
  subpaths for exactly that reason; the specifiers are load-bearing, not cosmetic. Verified by
  mutation: pointing `transport-rn.ts` at the root fails `pnpm -C apps/manager bundle:check` with
  *"Unable to resolve module node:zlib"*.
