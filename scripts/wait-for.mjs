const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/wait-for.mjs URL');
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) {
      console.log(`Ready: ${url}`);
      process.exit(0);
    }
  } catch {
    /* retry startup */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error(`Service did not become ready: ${url}`);
