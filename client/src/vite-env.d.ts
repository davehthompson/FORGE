/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGO_DEV_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
