// HMAC verification for agent → hub requests.
// Signature scheme (opt-in / soft):
//   Header:  X-FireSync-Signature: sha256=<hex>
//   Body:    HMAC-SHA256(secret = database.agent_token, message = raw request body)
//
// The verification is "soft": if the header is absent we accept the request
// (backwards-compatibility with agents older than v1.2). If the header is
// present, it MUST validate — a bad signature rejects the request with 401.
//
// Once every deployed agent runs v1.2+, flip requireHmac() to always require
// the header by removing the "header absent" early-return.

import { createHmac, timingSafeEqual } from "node:crypto";

const HEADER = "x-firesync-signature";

function hex(buf: Buffer): string {
  return buf.toString("hex");
}

export type HmacResult =
  | { ok: true; verified: boolean }
  | { ok: false; code: "INVALID_SIGNATURE"; message: string };

/**
 * Verify the HMAC signature of a request body against an agent token.
 * Returns `{ ok: true, verified: true }` when the signature matches,
 * `{ ok: true, verified: false }` when no signature header was sent
 * (legacy agent), and `{ ok: false, ... }` when the signature is present
 * but invalid.
 */
export function verifyAgentSignature(
  request: Request,
  rawBody: string,
  agentToken: string,
): HmacResult {
  const header = request.headers.get(HEADER);
  if (!header) return { ok: true, verified: false };

  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = hex(
    createHmac("sha256", agentToken).update(rawBody, "utf8").digest(),
  );

  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "INVALID_SIGNATURE", message: "Assinatura HMAC inválida" };
  }
  return { ok: true, verified: true };
}
