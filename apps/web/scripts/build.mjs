// Set this before Vite resolves .env so a local API NODE_ENV cannot select React's dev runtime.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
