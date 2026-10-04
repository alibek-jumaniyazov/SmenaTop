import type { Locator, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type PageOptions = NonNullable<Parameters<Page['screenshot']>[0]> & { path: string };
type LocatorOptions = NonNullable<Parameters<Locator['screenshot']>[0]> & { path: string };

export function saveScreenshot(target: Page, options: PageOptions): Promise<Buffer>;
export function saveScreenshot(target: Locator, options: LocatorOptions): Promise<Buffer>;
export async function saveScreenshot(
  target: Page | Locator,
  options: PageOptions | LocatorOptions,
) {
  const { path, ...captureOptions } = options;
  // Capture once. Browser errors and visual/assertion failures must never be retried here.
  const buffer = await target.screenshot({
    ...captureOptions,
    type: captureOptions.type ?? (/^\.jpe?g$/i.test(extname(path)) ? 'jpeg' : 'png'),
  });
  await mkdir(dirname(path), { recursive: true });
  const retryDelays = [100, 250, 500];
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(path, buffer);
      return buffer;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== 'win32' ||
        !['UNKNOWN', 'EBUSY', 'EACCES', 'EPERM'].includes(code ?? '') ||
        attempt >= retryDelays.length
      )
        throw error;
      await delay(retryDelays[attempt]);
    }
  }
}
