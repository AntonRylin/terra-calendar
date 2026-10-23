import { invoke } from '@tauri-apps/api/core';

/**
 * Account secrets, stored in the OS keychain via Rust commands. The secret
 * never lives in JS state, localStorage, or the repo — only in the keychain,
 * fetched on demand when building a repository.
 */
export const credentials = {
  save: (account: string, secret: string) => invoke<void>('save_credential', { account, secret }),
  get: (account: string) => invoke<string | null>('get_credential', { account }),
  remove: (account: string) => invoke<void>('delete_credential', { account }),
};
