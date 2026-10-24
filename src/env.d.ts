/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Ratings server for this build; defaults to DEFAULT_SERVER_URL in src/sites.ts. */
  readonly WXT_SERVER_URL?: string;
}
