/** Public, non-secret build context. Server guards remain authoritative. */
export const appEnvironment =
  import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? 'local' : 'production');
export const localToolsEnabled = ['local', 'staging'].includes(appEnvironment);
