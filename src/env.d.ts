interface ImportMetaEnv {
  readonly VITE_FEISHU_SYNC_ENDPOINT?: string;
  readonly VITE_SYNC_SECRET?: string;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
