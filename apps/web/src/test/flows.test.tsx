import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { api, ApiError, setCsrf } from '../api';
import { dateOnly, dateTime, money } from '../components';
import { localToIso, availabilitySchema } from '../pages/Worker';
import { AuthPage } from '../pages/Auth';
import { ShiftSearch } from '../pages/Public';
import i18n from '../i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  void i18n.changeLanguage('uz');
});
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MotionConfig reducedMotion="always">{element}</MotionConfig>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Money and Tashkent shift display', () => {
  it('renders minor-unit UZS without using unsupported Uzbek ICU month names', () => {
    expect(money('2500000')).toBe('25\u00a0000');
    expect(dateOnly('2026-09-23T04:00:00Z')).toBe('23 sentabr, Chor');
    expect(dateTime('2026-09-23T04:00:00Z')).toBe('23 sentabr, 09:00');
  });
  it('converts local overnight shifts independently of browser timezone', () => {
    expect(localToIso('2026-09-23T01:00')).toBe('2026-09-22T20:00:00.000Z');
    expect(
      availabilitySchema.safeParse({ startAt: '2026-09-22T22:00', endAt: '2026-09-23T06:00' })
        .success,
    ).toBe(true);
    expect(
      availabilitySchema.safeParse({ startAt: '2026-09-22T22:00', endAt: '2026-09-22T22:00' })
        .success,
    ).toBe(false);
  });
});
describe('Server-backed mutations', () => {
  it('rejects server conflicts rather than reporting local success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'SHIFT_FULL', message: 'No capacity remains' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(api('/offers/id/accept', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 409,
      code: 'SHIFT_FULL',
    });
  });
  it('sends HttpOnly session cookie credentials and CSRF header with requests', async () => {
    setCsrf('fresh-csrf-token');
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await api('/worker/availability', { method: 'POST', body: '{}' });
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(fetch.mock.calls[0][1].headers.get('x-csrf-token')).toBe('fresh-csrf-token');
  });
  it('keeps API errors typed for 403/401 error states', () =>
    expect(new ApiError(403, 'FORBIDDEN', 'Denied')).toBeInstanceOf(Error));
});
describe('Accessible acquisition flow', () => {
  it('validates an invalid phone before sending an OTP and translates labels', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })),
      );
    vi.stubGlobal('fetch', fetch);
    mount(<AuthPage />);
    fireEvent.change(screen.getByLabelText('Telefon raqam'), { target: { value: '998' } });
    fireEvent.click(screen.getByRole('button', { name: /Kod yuborish/ }));
    expect(await screen.findByText('+998 bilan boshlangan to‘liq raqam kiriting')).toBeVisible();
    expect(
      fetch.mock.calls.some((call: unknown[]) => String(call[0]).includes('/otp/request')),
    ).toBe(false);
    await i18n.changeLanguage('ru');
    expect(await screen.findByLabelText('Номер телефона')).toBeVisible();
  });
  it('loads unfiltered shifts without sending invalid empty UUID filters', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        urls.push(url);
        if (url.includes('/catalog'))
          return Promise.resolve(
            new Response(JSON.stringify({ cities: [], categories: [], skills: [] })),
          );
        if (url.includes('/auth/me')) return Promise.resolve(new Response('{}', { status: 401 }));
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 })),
        );
      }),
    );
    mount(<ShiftSearch worker />);
    await waitFor(() => expect(urls.some((url) => url.includes('/shifts?'))).toBe(true));
    const shiftUrl = urls.find((url) => url.includes('/shifts?'))!;
    expect(shiftUrl).not.toContain('cityId=');
    expect(shiftUrl).not.toContain('categoryId=');
    expect(await screen.findByText('Bu tanlovga mos smena topilmadi')).toBeVisible();
  });
});
