import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShiftSearch } from '../pages/Public';
import { useUrlFilters } from '../use-url-filters';
import i18n from '../i18n';

const cityId = '10000000-0000-4000-8000-000000000001';
const categoryId = '20000000-0000-4000-8000-000000000001';
const catalog = {
  cities: [{ id: cityId, nameUz: 'Toshkent', nameRu: 'Ташкент' }],
  categories: [{ id: categoryId, nameUz: 'Oshpaz', nameRu: 'Повар' }],
  skills: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  void i18n.changeLanguage('uz');
});

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search-url">{location.search}</output>
      <button onClick={() => navigate(-1)}>Previous URL</button>
    </>
  );
}

it('keeps consecutive shift filters and lets Back restore the previous selection', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/catalog') ? catalog : { items: [], total: 0, page: 1, pageSize: 12 },
          ),
        ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['api', '/catalog'], catalog);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/worker/shifts?page=3']}>
        <ShiftSearch worker />
        <NavigationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const city = screen.getByRole('combobox', { name: 'Shahar' });
  const category = screen.getByRole('combobox', { name: 'Kasb' });
  act(() => {
    fireEvent.change(city, { target: { value: cityId } });
    fireEvent.change(category, { target: { value: categoryId } });
  });
  await waitFor(() => {
    const params = new URLSearchParams(screen.getByTestId('search-url').textContent || '');
    expect(params.get('cityId')).toBe(cityId);
    expect(params.get('categoryId')).toBe(categoryId);
    expect(params.has('page')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Previous URL' }));
  await waitFor(() => {
    expect(city).toHaveValue(cityId);
    expect(category).toHaveValue('');
  });
  fireEvent.change(city, { target: { value: '' } });
  await waitFor(() => expect(screen.getByTestId('search-url')).toHaveTextContent(/^$/));
});

it('restores URL selections after a fresh mount with a delayed catalog', async () => {
  let deliverCatalog!: (value: Response) => void;
  const catalogResponse = new Promise<Response>((resolve) => {
    deliverCatalog = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/catalog')
        ? catalogResponse
        : Promise.resolve(
            new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 })),
          ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`/worker/shifts?cityId=${cityId}&categoryId=${categoryId}&q=Smena`]}
      >
        <ShiftSearch worker />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await act(async () => {
    deliverCatalog(new Response(JSON.stringify(catalog)));
  });
  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Shahar' })).toHaveValue(cityId);
    expect(screen.getByRole('combobox', { name: 'Kasb' })).toHaveValue(categoryId);
    expect(screen.getByRole('textbox', { name: 'Qidirish' })).toHaveValue('Smena');
  });
});

function InboxFilterProbe() {
  const [params, update] = useUrlFilters();
  return (
    <>
      <output data-testid="inbox-url">{params.toString()}</output>
      <button
        onClick={() => {
          update((next) => next.set('status', 'active'), { replace: true });
          update((next) => next.set('q', 'Ali'), { replace: true });
        }}
      >
        Change both filters
      </button>
    </>
  );
}

it('accumulates replacement filters without dropping the organization context', async () => {
  render(
    <MemoryRouter initialEntries={['/employer/applications?org=one']}>
      <InboxFilterProbe />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change both filters' }));
  await waitFor(() => {
    const params = new URLSearchParams(screen.getByTestId('inbox-url').textContent || '');
    expect(params.get('org')).toBe('one');
    expect(params.get('status')).toBe('active');
    expect(params.get('q')).toBe('Ali');
  });
});
