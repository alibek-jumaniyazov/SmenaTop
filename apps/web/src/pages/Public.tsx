import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAction, useApi, useSession } from '../api';
import type { Catalog, Page, Plan, Shift } from '../api';
import { useUrlFilters } from '../use-url-filters';
import {
  Action,
  Empty,
  ErrorState,
  Feedback,
  InlineLink,
  PageHeading,
  PublicLayout,
  QueryState,
  ShiftCard,
  Status,
  Steps,
  dateOnly,
  dateTime,
  money,
  timeOnly,
} from '../components';

export function ShiftSearch({ worker = false }: { worker?: boolean }) {
  const { t, i18n } = useTranslation();
  const [params, updateParams] = useUrlFilters();
  const search = params.get('q') || '';
  const city = params.get('cityId') || '';
  const category = params.get('categoryId') || '';
  const parsedPage = Number(params.get('page') || 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [q, setQ] = useState(search);
  useEffect(() => setQ(search), [search]);
  const setFilter = (key: string, value: string) => {
    updateParams((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
    });
  };
  const clearFilters = () => {
    setQ('');
    updateParams((next) => [...next.keys()].forEach((key) => next.delete(key)));
  };
  const catalog = useApi<Catalog>('/catalog');
  const query = useApi<Page<Shift>>(
    `/shifts?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(city ? { cityId: city } : {}), ...(category ? { categoryId: category } : {}), page: String(page), pageSize: '12' })}`,
  );
  const content = (
    <>
      <PageHeading
        eyebrow="SMENATOP / SHIFT BOARD"
        title={t('findShift')}
        text={t('exploreText')}
      />
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter('q', q.trim());
        }}
      >
        <label className="search-input">
          <Search size={20} />
          <span className="sr-only">{t('search')}</span>
          <input
            placeholder={t('search')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">{t('city')}</span>
          <select
            value={city}
            onChange={(event) => {
              setFilter('cityId', event.target.value);
            }}
          >
            <option value="">{t('allCities')}</option>
            {catalog.data?.cities.map((item) => (
              <option key={item.id} value={item.id}>
                {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{t('category')}</span>
          <select
            value={category}
            onChange={(event) => {
              setFilter('categoryId', event.target.value);
            }}
          >
            <option value="">{t('allCategories')}</option>
            {catalog.data?.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-primary">
          {t('search')}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="results-row">
        <strong>
          {query.isPending ? '…' : (query.data?.total ?? 0)} {t('results')}
        </strong>
        <span>
          {search || city || category ? (
            <button className="text-button" onClick={clearFilters}>
              {t('clearFilters')}
            </button>
          ) : (
            t('timeZone')
          )}
        </span>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {query.data?.items.length ? (
          <div className="shift-grid">
            {query.data.items.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} worker={worker} />
            ))}
          </div>
        ) : (
          <Empty
            title={t('emptyShifts')}
            text={t('emptyShiftsText')}
            action={
              <button className="button button-outline" onClick={clearFilters}>
                {t('clearFilters')}
              </button>
            }
          />
        )}
      </QueryState>
      <div className="pagination">
        <button
          className="button button-outline compact"
          disabled={page === 1}
          onClick={() => setFilter('page', String(page - 1))}
        >
          {t('previous')}
        </button>
        <span>{page}</span>
        <button
          className="button button-outline compact"
          disabled={!query.data || page * 12 >= (query.data.total || 0)}
          onClick={() => setFilter('page', String(page + 1))}
        >
          {t('next')}
        </button>
      </div>
    </>
  );
  return worker ? (
    content
  ) : (
    <PublicLayout>
      <div className="container page-section">{content}</div>
    </PublicLayout>
  );
}
export function ShiftDetail({ worker = false }: { worker?: boolean }) {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const session = useSession();
  const query = useApi<Shift>(`/shifts/${id}`);
  const apply = useAction(`/shifts/${id}/applications`);
  const favorite = useAction(`/worker/favorites/${id}`, 'POST');
  const schema = z.object({ note: z.string().max(1000) });
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { note: '' },
  });
  const content = (
    <>
      <Link className="back-link" to={worker ? '/worker/shifts' : '/shifts'}>
        ← {t('allShifts')}
      </Link>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {query.data && (
          <>
            <PageHeading
              eyebrow={query.data.organization?.name}
              title={query.data.title}
              text={query.data.branch?.area}
            />
            <div className="detail-layout">
              <div className="detail-main">
                <div className="detail-time">
                  <CalendarDays size={25} />
                  <div>
                    <strong>{dateOnly(query.data.startAt, i18n.language)}</strong>
                    <span>
                      {timeOnly(query.data.startAt)} — {timeOnly(query.data.endAt)}
                    </span>
                  </div>
                  <Status value={query.data.status} />
                </div>
                <section className="panel">
                  <h2>{t('description')}</h2>
                  <p className="preserve-lines">{query.data.description}</p>
                  <h3>{t('requirements')}</h3>
                  <ul className="check-list">
                    {query.data.requirements?.map((item) => (
                      <li key={item}>
                        <CheckCircle2 size={17} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="detail-facts">
                    <div>
                      <Clock3 size={20} />
                      <div>
                        <strong>
                          {query.data.breakMinutes} {t('minute')}
                        </strong>
                        <span>{t(query.data.paidBreak ? 'paidBreak' : 'unpaidBreak')}</span>
                      </div>
                    </div>
                    <div>
                      <Users size={20} />
                      <div>
                        <strong>
                          {query.data.headcount} {t('places')}
                        </strong>
                        <span>
                          {query.data.filledCount || 0} {t('filledPlaces').toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <MapPin size={20} />
                      <div>
                        <strong>{query.data.branch?.area}</strong>
                        <span>{t('location')}</span>
                      </div>
                    </div>
                  </div>
                  {query.data.applyDeadline && (
                    <p>
                      {t('deadline')}: {dateTime(query.data.applyDeadline, i18n.language)}
                    </p>
                  )}
                  {query.data.clothing && (
                    <p>
                      {t('outfit')}: {query.data.clothing}
                    </p>
                  )}
                  {query.data.mealProvided && <span className="chip">{t('meal')}</span>}
                  {query.data.transportProvided && <span className="chip">{t('transport')}</span>}
                </section>
                <section className="panel employer-detail">
                  <span className="organization-mark">
                    <Users />
                  </span>
                  <div>
                    <span className="muted">{t('employer')}</span>
                    <h3>{query.data.organization?.name}</h3>
                    <Status value={query.data.organization?.verificationStatus || 'UNVERIFIED'} />
                    {query.data.organization?.synthetic && (
                      <p className="small muted">{t('sampleData')}</p>
                    )}
                  </div>
                </section>
              </div>
              <aside className="detail-cta panel">
                <span className="eyebrow">{t('pay')}</span>
                <div className="pay-large">
                  {money(query.data.amountMinor, i18n.language)}
                  <span>{t('currency')}</span>
                </div>
                <p>{t(query.data.payType === 'HOURLY' ? 'perHour' : 'fixed')}</p>
                <hr />
                <p className="small">{t('workerPayNote')}</p>
                {session.data ? (
                  <form
                    className="form-stack"
                    onSubmit={handleSubmit((data) => apply.mutate(data))}
                  >
                    <label>
                      {t('note')}
                      <textarea {...register('note')} placeholder={t('applicationNote')} rows={3} />
                    </label>
                    <button
                      className="button button-primary"
                      disabled={
                        apply.isPending || apply.isSuccess || query.data.status !== 'PUBLISHED'
                      }
                    >
                      {apply.isSuccess ? t('applied') : t('apply')}
                      <ArrowUpRight size={17} />
                    </button>
                    <Feedback error={apply.error} success={apply.isSuccess} />
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => favorite.mutate({})}
                      disabled={favorite.isPending || favorite.isSuccess}
                    >
                      {favorite.isSuccess ? t('saved') : t('favorites')}
                    </button>
                    <Feedback error={favorite.error} />
                  </form>
                ) : (
                  <Link
                    className="button button-primary"
                    to={`/auth?next=${encodeURIComponent(`/worker/shifts/${id}`)}`}
                  >
                    {t('login')} · {t('apply')}
                    <ArrowRight size={18} />
                  </Link>
                )}
                <div className="detail-assurance">
                  <ShieldCheck size={18} />
                  {t('phoneVerified')}
                </div>
              </aside>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
  return worker ? (
    content
  ) : (
    <PublicLayout>
      <div className="container page-section">{content}</div>
    </PublicLayout>
  );
}
export function Pricing() {
  const { t, i18n } = useTranslation();
  const query = useApi<Plan[]>('/billing/plans');
  return (
    <PublicLayout>
      <section className="container page-section">
        <PageHeading eyebrow="SMENATOP BUSINESS" title={t('pricing')} text={t('planHint')} />
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          <div className="pricing-grid">
            {query.data?.map((plan, index) => {
              const version = plan.versions[0];
              return (
                <article className={`price-card ${index === 1 ? 'featured' : ''}`} key={plan.id}>
                  <span className="eyebrow">{plan.code}</span>
                  <h2>{plan.name}</h2>
                  <div className="price-amount">
                    {money(version.priceMinor, i18n.language)} <small>{t('currency')}</small>
                  </div>
                  <p>{t('monthly')}</p>
                  <ul className="check-list">
                    <li>
                      <Check />
                      {version.publishLimit} {t('quota')}
                    </li>
                    <li>
                      <Check />
                      {version.branchLimit} {t('branchLimit')}
                    </li>
                    <li>
                      <Check />
                      {version.memberLimit} {t('members')}
                    </li>
                  </ul>
                  <Link
                    className={`button ${index === 1 ? 'button-primary' : 'button-outline'}`}
                    to="/auth?intent=employer"
                  >
                    {t('continue')}
                    <ArrowRight size={18} />
                  </Link>
                </article>
              );
            })}
          </div>
        </QueryState>
        <p className="muted center">{t('noAutoDebit')}</p>
      </section>
    </PublicLayout>
  );
}
export function InfoPage({
  kind,
}: {
  kind: 'how' | 'workers' | 'business' | 'faq' | 'privacy' | 'terms' | 'help';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const support = useAction('/support');
  const titleKey = kind === 'workers' ? 'forWorkers' : kind === 'business' ? 'forBusiness' : kind;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(
      z.object({ subject: z.string().min(3), description: z.string().min(10) }),
    ),
    defaultValues: { subject: '', description: '' },
  });
  return (
    <PublicLayout>
      <div className="container page-section">
        <PageHeading eyebrow="SMENATOP" title={kind === 'faq' ? 'FAQ' : t(titleKey)} />
        {['how', 'workers', 'business'].includes(kind) && (
          <>
            <p className="lead">{t(kind === 'business' ? 'businessText' : 'heroText')}</p>
            <Steps />
            <div className="info-cta">
              <Link
                to={kind === 'business' ? '/auth?intent=employer' : '/shifts'}
                className="button button-primary"
              >
                {t(kind === 'business' ? 'createOrg' : 'findShift')}
                <ArrowRight size={18} />
              </Link>
              <p>{t(kind === 'business' ? 'noGuarantee' : 'workerPayNote')}</p>
            </div>
          </>
        )}
        {kind === 'faq' && (
          <div className="faq-list">
            {[1, 2, 3].map((n) => (
              <details key={n}>
                <summary>{t(`faq${n}`)}</summary>
                <p>{t(`faq${n}Answer`)}</p>
              </details>
            ))}
          </div>
        )}
        {['privacy', 'terms'].includes(kind) && (
          <article className="legal-content panel">
            <p className="notice">{t('legalDraft')}</p>
            <h2>SmenaTop · v1</h2>
            <p>{t('legalOperator')}</p>
            <p>{t(kind === 'privacy' ? 'privacyText' : 'termsText')}</p>
            <p>{t('retention')}</p>
            <InlineLink to="/help">{t('help')}</InlineLink>
          </article>
        )}
        {kind === 'help' && (
          <div className="split-content">
            <div>
              <h2>{t('help')}</h2>
              <p>{t('workerPayNote')}</p>
              <InlineLink to="/faq">FAQ</InlineLink>
            </div>
            <form
              className="panel form-stack"
              onSubmit={handleSubmit((data) =>
                session.data ? support.mutate(data) : navigate('/auth?next=/help'),
              )}
            >
              <label>
                {t('subject')}
                <input {...register('subject')} />
                {errors.subject && <span className="field-error">{t('required')}</span>}
              </label>
              <label>
                {t('description')}
                <textarea rows={5} {...register('description')} />
                {errors.description && <span className="field-error">{t('required')}</span>}
              </label>
              <button disabled={support.isPending} className="button button-primary">
                {t('send')}
                <ArrowRight size={17} />
              </button>
              <Feedback error={support.error} success={support.isSuccess} />
            </form>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
export function NotFound({ forbidden = false }: { forbidden?: boolean }) {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <div className="container page-section">
        <div className="not-found">
          <span>{forbidden ? '403' : '404'}</span>
          <h1>{t(forbidden ? 'forbidden' : 'notFound')}</h1>
          <Link to="/" className="button button-primary">
            {t('home')}
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}

// Native links and fully server-backed actions keep the public experience usable without animations.
void Action;
void ErrorState;
