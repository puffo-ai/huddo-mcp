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

declare const __APP_VERSION__: string;
declare const __APP_BUILT_AT__: number;
