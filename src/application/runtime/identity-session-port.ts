export type IdentitySessionProjection = Readonly<{
  slug: string;
  serverUrl: string;
}>;

export type IdentitySessionActivationSource =
  | "authentication"
  | "restore"
  | "storage-sync";

export type IdentitySessionProjectionSink = Readonly<{
  activate(
    projection: IdentitySessionProjection,
    source?: IdentitySessionActivationSource,
  ): void;
  restore?(): void;
  signOut(): void;
}>;

export interface IdentitySessionPort {
  authenticate(
    projection: IdentitySessionProjection,
    ceremony: "login" | "register",
  ): Promise<void>;
  restore(): Promise<void>;
  validateActive(): Promise<void>;
  logout(): Promise<void>;
  dispose(): void;
}

let installed: IdentitySessionPort | null = null;
let testFallback: (() => Promise<IdentitySessionPort>) | null = null;

export function installIdentitySessionPort(port: IdentitySessionPort): void {
  if (installed) throw new Error("identity-session authority already installed");
  installed = port;
}

export function setIdentitySessionTestFallback(factory: (() => Promise<IdentitySessionPort>) | null): void {
  testFallback = factory;
}

async function authority(): Promise<IdentitySessionPort> {
  if (!installed && testFallback) installed = await testFallback();
  if (!installed) throw new Error("identity-session authority is not installed");
  return installed;
}

export const authenticateIdentitySession = (
  slug: string,
  serverUrl: string,
  ceremony: "login" | "register" = "login",
): Promise<void> => authority().then((port) => port.authenticate({ slug, serverUrl }, ceremony));

export const restoreIdentitySession = (): Promise<void> => authority().then((port) => port.restore());
export const validateIdentitySession = (): Promise<void> => authority().then((port) => port.validateActive());
export const logoutIdentitySession = (): Promise<void> => authority().then((port) => port.logout());

export function createTypeScriptIdentitySessionPort(
  sink: IdentitySessionProjectionSink,
): IdentitySessionPort {
  return {
    async authenticate(projection) { sink.activate(projection, "authentication"); },
    async restore() { sink.restore?.(); },
    async validateActive() {},
    async logout() { sink.signOut(); },
    dispose() {},
  };
}

export function resetIdentitySessionPortForTests(): void {
  installed?.dispose();
  installed = null;
}
