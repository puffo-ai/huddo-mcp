interface ImportMetaEnv {
  readonly MODE: string;
  readonly VITE_HUDDO_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*?url" {
  const url: string;
  export default url;
}
