// Server-only helpers to encrypt/decrypt Firebird credentials at rest.
// Key comes from the DB_CRED_ENC_KEY secret and is read per-request.

const PREFIX = "enc.v1.";

function b64encode(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey() {
  const raw = process.env.DB_CRED_ENC_KEY;
  if (!raw) throw new Error("DB_CRED_ENC_KEY não configurado");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${PREFIX}${b64encode(iv)}.${b64encode(ct)}`;
}

export async function decryptSecret(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext fallback
  const parts = value.split(".");
  const ivPart = parts[2];
  const ctPart = parts[3];
  if (parts.length !== 4 || !ivPart || !ctPart) return null;
  try {
    const key = await getKey();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(ivPart) },
      key,
      b64decode(ctPart),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Resolves the Firebird password for a database row (encrypted first, legacy plaintext as fallback). */
export async function resolveDbPassword(db: {
  password_cipher?: string | null;
  password_encrypted?: string | null;
}): Promise<string | null> {
  if (db.password_cipher) return decryptSecret(db.password_cipher);
  return db.password_encrypted ?? null;
}
