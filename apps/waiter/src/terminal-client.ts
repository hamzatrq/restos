/**
 * # `04-F22` (b) — the tablet's half of proof-of-possession, and the ONLY module here that talks
 *
 * Everything this file holds is a key the browser will not export and a session handle the till
 * minted. There is no store, no ledger, no device identity and no user id (`04-F21`, `04-F22` (c)):
 * a compromised pad has nothing to steal but its own admission, which the till can revoke.
 *
 * ## Why the key is non-extractable, and what that does and does not buy
 *
 * `generateKey(..., extractable = false, ...)` means the private key never becomes bytes any
 * script — ours or anyone's — can read. So a stolen backup, a copied profile directory or an XSS
 * payload cannot lift the credential and sign from elsewhere. What it does NOT buy: anything at
 * all against someone holding the unlocked tablet, who simply uses it. `04-F22`'s answer to that
 * is the PIN, and the pad's answer is `01-F26`'s idle lock.
 */

const DB = "restos-waiter";
const STORE = "admission";
const KEY = "terminal";

type Admission = { terminal_id: string; keys: CryptoKeyPair };

/**
 * IndexedDB rather than `localStorage`, and the reason is the key rather than the size:
 * `localStorage` stores strings, so a `CryptoKey` would have to be exported to live there — which
 * is exactly the property being bought by making it non-extractable. IndexedDB stores the handle.
 */
const open = (): Promise<IDBDatabase> =>
  new Promise((done, fail) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => done(request.result);
    request.onerror = () => fail(request.error);
  });

const read = async (): Promise<Admission | null> => {
  const db = await open();
  return new Promise((done) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    request.onsuccess = () => done((request.result as Admission | undefined) ?? null);
    request.onerror = () => done(null);
  });
};

const write = async (value: Admission): Promise<void> => {
  const db = await open();
  await new Promise<void>((done) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, KEY);
    request.onsuccess = () => done();
    request.onerror = () => done();
  });
};

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

const b64url = (bytes: ArrayBuffer): string => {
  let text = "";
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * The bytes the till hashes, byte for byte (`terminal-server.ts`'s `signedBytes`).
 *
 * ⚠ **LENGTH-PREFIXED, not separated, and both ends must agree exactly.** The first version of the
 * till's helper used a separator character and one byte of it was silently a NUL rather than a
 * space: every honest signature was rejected and the failure was indistinguishable from an attack.
 * A prefix has no character to get invisibly wrong, and it removes the concatenation ambiguity a
 * separator carries whenever the separator can occur in the nonce.
 */
const signedBytes = (nonce: string, body: string): Uint8Array => {
  const n = new TextEncoder().encode(nonce);
  const b = new TextEncoder().encode(body);
  const out = new Uint8Array(4 + n.length + b.length);
  new DataView(out.buffer).setUint32(0, n.length);
  out.set(n, 4);
  out.set(b, 4 + n.length);
  return out;
};

export type TerminalClient = {
  enrolled: () => boolean;
  enrol: (code: string) => Promise<boolean>;
  call: (body: unknown) => Promise<unknown>;
};

export const createTerminalClient = (origin: string): TerminalClient => {
  let admission: Admission | null = null;

  const post = async (path: string, body: string, headers: Record<string, string> = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    });
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };

  return {
    enrolled: () => admission !== null,

    enrol: async (code: string): Promise<boolean> => {
      admission = await read();
      if (admission !== null) return true;
      // `04-F22` (b) — the private half never leaves this browser, and cannot: `extractable` is
      // false, so there is no API by which any script obtains its bytes.
      const keys = (await crypto.subtle.generateKey(ALG, false, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const spki = await crypto.subtle.exportKey("spki", keys.publicKey);
      const result = await post("/enrol", JSON.stringify({ code, public_key: b64url(spki) }));
      if (result.status !== 200 || typeof result.json.terminal_id !== "string") return false;
      admission = { terminal_id: result.json.terminal_id, keys };
      await write(admission);
      return true;
    },

    /**
     * One signed round trip. A fresh nonce EVERY time, because the till consumes each one on first
     * use — that is what makes a captured request unusable rather than merely encrypted.
     *
     * It deliberately does NOT retry. A lost response is ambiguous (`04-F24`): the till may have
     * appended and the answer may have been lost, and `01-F1` makes a duplicated line permanent.
     * The pad re-reads what the till holds instead of guessing, which is what a terminal is for.
     */
    call: async (body: unknown): Promise<unknown> => {
      admission ??= await read();
      if (admission === null) throw new Error("this tablet is not enrolled");
      const raw = JSON.stringify(body);
      const nonce = (await post("/nonce", JSON.stringify({ terminal_id: admission.terminal_id })))
        .json.nonce;
      if (typeof nonce !== "string") throw new Error("the till issued no nonce");
      const signature = await crypto.subtle.sign(
        SIGN,
        admission.keys.privateKey,
        signedBytes(nonce, raw) as unknown as BufferSource,
      );
      const result = await post("/rpc", raw, {
        "x-restos-terminal": admission.terminal_id,
        "x-restos-nonce": nonce,
        "x-restos-signature": b64url(signature),
      });
      if (result.status === 401) throw new Error("this tablet is no longer admitted");
      return result.json;
    },
  };
};
