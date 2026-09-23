import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkerProfilePage } from '../pages/WorkerProfile';
import i18n from '../i18n';
import { clearProfileDrafts } from '../profile-drafts';

afterEach(() => {
  cleanup();
  clearProfileDrafts();
  vi.unstubAllGlobals();
  void i18n.changeLanguage('uz');
});
const cityId = '10000000-0000-4000-8000-000000000001';
const categoryId = '20000000-0000-4000-8000-000000000001';
function setup() {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const state = {
    name: 'Ali Valiyev',
    fail: false,
    profile: {
      id: 'profile-id',
      cityId,
      categoryIds: [categoryId],
      languages: ['uz'],
      experience: 'Oshxonada ishlaganman.',
      skills: [],
      verificationStatus: 'UNVERIFIED',
      adultConfirmed: true,
    },
    bodies: [] as Record<string, unknown>[],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/me'))
        return new Response(
          JSON.stringify({
            user: {
              id: 'worker-id',
              name: state.name,
              phone: '+998901000001',
              platformPermissions: [],
            },
            workerProfile: state.profile,
            memberships: [],
            csrfToken: 'test-csrf',
          }),
        );
      if (url.endsWith('/worker/profile') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        state.bodies.push(body);
        if (state.fail)
          return new Response(JSON.stringify({ code: 'CONFLICT', message: 'Save failed' }), {
            status: 409,
          });
        state.name = String(body.name);
        state.profile = {
          ...state.profile,
          experience: String(body.experience),
          languages: body.languages as string[],
          verificationStatus: body.submit ? 'PENDING' : state.profile.verificationStatus,
        };
        return new Response(JSON.stringify(state.profile));
      }
      if (url.endsWith('/worker/profile')) return new Response(JSON.stringify(state.profile));
      if (url.endsWith('/catalog'))
        return new Response(
          JSON.stringify({
            cities: [{ id: cityId, nameUz: 'Toshkent', nameRu: 'Ташкент' }],
            categories: [{ id: categoryId, nameUz: 'Oshpaz', nameRu: 'Повар' }],
            skills: [],
          }),
        );
      if (url.endsWith('/files')) return new Response('[]');
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/worker/profile']}>
        <Link to="/other">Leave profile for test</Link>
        <Routes>
          <Route path="/worker/profile" element={<WorkerProfilePage />} />
          <Route path="/other" element={<Link to="/worker/profile">Return to profile</Link>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { state, client };
}
async function edit() {
  const tabs = await screen.findByRole('group', { name: 'Profil bo‘limlari' });
  fireEvent.click(within(tabs).getByRole('button', { name: 'Profilni tahrirlash' }));
  return screen.findByLabelText('Ish tajribasi', { exact: false, selector: 'textarea' });
}
describe('Worker resume draft and review workflow', () => {
  it('restores unsaved edits after internal navigation and clears an explicit discard', async () => {
    const { state } = setup();
    const experience = await edit();
    fireEvent.change(experience, { target: { value: 'Navigatsiyadan keyin qoladigan tajriba.' } });
    fireEvent.click(screen.getByRole('link', { name: 'Leave profile for test' }));
    fireEvent.click(screen.getByRole('link', { name: 'Return to profile' }));
    expect(
      await screen.findByLabelText('Ish tajribasi', { exact: false, selector: 'textarea' }),
    ).toHaveValue('Navigatsiyadan keyin qoladigan tajriba.');
    expect(state.profile.experience).toBe('Oshxonada ishlaganman.');
    fireEvent.click(screen.getByRole('button', { name: 'O‘zgarishlarni bekor qilish' }));
    fireEvent.click(screen.getByRole('link', { name: 'Leave profile for test' }));
    fireEvent.click(screen.getByRole('link', { name: 'Return to profile' }));
    expect(await edit()).toHaveValue('Oshxonada ishlaganman.');
    expect(state.bodies).toHaveLength(0);
  });

  it('opens consent policies in another tab so reading them preserves the editor', async () => {
    setup();
    await edit();
    for (const name of ['Foydalanish shartlari', 'Maxfiylik siyosati']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('retains unsaved edits during a server refetch and saved-view round trip', async () => {
    const { state, client } = setup();
    const experience = await edit();
    fireEvent.change(experience, { target: { value: 'Mening saqlanmagan tajribam.' } });
    state.profile.experience = 'Serverdagi yangilangan tajriba.';
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['api', '/worker/profile'] });
    });
    expect(experience).toHaveValue('Mening saqlanmagan tajribam.');
    fireEvent.click(screen.getByRole('button', { name: 'Profil ko‘rinishi' }));
    expect(await screen.findByText('Serverdagi yangilangan tajriba.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlashni davom ettirish' }));
    expect(
      await screen.findByLabelText('Ish tajribasi', { exact: false, selector: 'textarea' }),
    ).toHaveValue('Mening saqlanmagan tajribam.');
    expect(state.bodies).toHaveLength(0);
  });
  it('preserves input after a failed draft save, and saves without submitting for review', async () => {
    const { state } = setup();
    const experience = await edit();
    fireEvent.change(experience, { target: { value: 'Yangi tajriba.' } });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Foydalanish shartlari va maxfiylik siyosatiga roziman',
      }),
    );
    state.fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'O‘zgarishlarni saqlash' }));
    expect(await screen.findByText('Save failed')).toBeVisible();
    expect(experience).toHaveValue('Yangi tajriba.');
    expect(state.bodies[0]).toMatchObject({
      submit: false,
      languages: ['uz'],
      adultConfirmed: true,
      termsAccepted: true,
    });
    state.fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'O‘zgarishlarni saqlash' }));
    expect(await screen.findByText('Profil ma’lumotlari saqlandi.')).toBeVisible();
    expect(await screen.findByText('Yangi tajriba.')).toBeVisible();
    expect(state.profile.verificationStatus).toBe('UNVERIFIED');
    fireEvent.click(screen.getByRole('link', { name: 'Leave profile for test' }));
    fireEvent.click(screen.getByRole('link', { name: 'Return to profile' }));
    expect(await screen.findByText('Yangi tajriba.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Tahrirlashni davom ettirish' })).toBeNull();
  });
  it('validates explicit consent and sends review only through the review action', async () => {
    const { state } = setup();
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash va tekshiruvga yuborish' }));
    const terms = screen.getByRole('checkbox', {
      name: 'Foydalanish shartlari va maxfiylik siyosatiga roziman',
    });
    await waitFor(() => expect(terms).toHaveAttribute('aria-invalid', 'true'));
    expect(terms).toHaveAttribute('aria-describedby');
    expect(state.bodies).toHaveLength(0);
    fireEvent.click(terms);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash va tekshiruvga yuborish' }));
    expect(await screen.findByText('Profil saqlandi va tekshiruvga yuborildi.')).toBeVisible();
    expect(state.bodies[0]).toMatchObject({ submit: true });
    expect(state.profile.verificationStatus).toBe('PENDING');
    expect(
      screen.queryByRole('button', { name: 'Tekshiruvga tayyorlash' }),
    ).not.toBeInTheDocument();
  });
});
