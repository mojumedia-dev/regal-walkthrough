/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPLAT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
