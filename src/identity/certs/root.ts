import type { CryptoOps } from "../../http/types";

export interface IdentityCert {
  type: string;
  version: number;
  root_public_key: string;
  identity_type: string;
  declared_operator_public_key: string | null;
  self_signature: string;
}

export interface SlugBinding {
  type: string;
  version: number;
  root_public_key: string;
  slug: string;
  issued_at: number;
  self_signature: string;
}

export interface RootKeyEnvelope {
  type: string;
  version: number;
  enrollment_nonce: string;
  recipient_kem_public_key: string;
  hpke_ciphertext: string;
  root_public_key_fingerprint: string;
}

export interface OperatorAttestation {
  type: string;
  version: number;
  operator_root_public_key: string;
  agent_root_public_key: string;
  issued_at: number;
  nonce: string;
  signature: string;
}

export function createIdentityCert(
  crypto: CryptoOps,
  rootSecretKey: Uint8Array,
  identityType: "human" | "agent" = "human",
  declaredOperatorPublicKey?: string,
): IdentityCert {
  const rootPk = crypto.ed25519PublicKeyFromSecret(rootSecretKey);

  const cert: IdentityCert = {
    type: "identity_cert",
    version: 1,
    root_public_key: crypto.base64urlEncode(rootPk),
    identity_type: identityType,
    declared_operator_public_key: declaredOperatorPublicKey ?? null,
    self_signature: "",
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(cert));
  const sig = crypto.ed25519Sign(rootSecretKey, canonical);
  cert.self_signature = crypto.base64urlEncode(sig);

  return cert;
}

export function createSlugBinding(
  crypto: CryptoOps,
  rootSecretKey: Uint8Array,
  slug: string,
  issuedAt?: number,
): SlugBinding {
  const rootPk = crypto.ed25519PublicKeyFromSecret(rootSecretKey);

  const binding: SlugBinding = {
    type: "slug_binding",
    version: 1,
    root_public_key: crypto.base64urlEncode(rootPk),
    slug,
    issued_at: issuedAt ?? Date.now(),
    self_signature: "",
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(binding));
  const sig = crypto.ed25519Sign(rootSecretKey, canonical);
  binding.self_signature = crypto.base64urlEncode(sig);

  return binding;
}

export function createOperatorAttestation(
  crypto: CryptoOps,
  operatorRootSecretKey: Uint8Array,
  agentRootPublicKey: string,
  issuedAt?: number,
): OperatorAttestation {
  const opRootPk = crypto.ed25519PublicKeyFromSecret(operatorRootSecretKey);
  const att: OperatorAttestation = {
    type: "operator_attestation",
    version: 1,
    operator_root_public_key: crypto.base64urlEncode(opRootPk),
    agent_root_public_key: agentRootPublicKey,
    issued_at: issuedAt ?? Date.now(),
    nonce: crypto.base64urlEncode(crypto.generateRandomBytes(32)),
    signature: "",
  };
  const canonical = crypto.canonicalizeForSigning(JSON.stringify(att));
  const sig = crypto.ed25519Sign(operatorRootSecretKey, canonical);
  att.signature = crypto.base64urlEncode(sig);
  return att;
}
