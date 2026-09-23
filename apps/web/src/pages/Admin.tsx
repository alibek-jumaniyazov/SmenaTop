import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowUpRight, FileCheck2, Search, ShieldCheck, Wallet } from 'lucide-react';
import { api, useApi } from '../api';
import {
  Action,
  Empty,
  ErrorState,
  PageHeading,
  QueryState,
  Status,
  dateTime,
  money,
} from '../components';
import { TextForm } from './Operations';

interface Verification {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  createdAt: string;
  notes?: string;
  submittedById: string;
}
interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  category?: string;
}
interface Queue {
  verifications: Verification[];
  disputes: Ticket[];
  tickets: Ticket[];
}
function SkillReviewQueue() {
  const { t, i18n } = useTranslation();
  const query = useApi<
    {
      id: string;
      status: string;
      skill: { nameUz: string; nameRu: string };
      workerProfile: { user: { name: string } };
    }[]
  >('/admin/worker-skills');
  return (
    <details className="panel skill-review">
      <summary>
        {t('skillReview')} · {query.data?.length || 0}
      </summary>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {query.data?.length ? (
          <div className="record-list">
            {query.data.map((item) => (
              <article className="record-card" key={item.id}>
                <ShieldCheck size={22} />
                <div>
                  <h3>{item.workerProfile.user.name}</h3>
                  <p>{item.skill[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}</p>
                  <Status value={item.status} />
                </div>
                <Action
                  reason
                  path={`/admin/worker-skills/${item.id}/verify`}
                  label={t('confirm')}
                  body={{ status: 'VERIFIED' }}
                />
                <Action
                  reason
                  path={`/admin/worker-skills/${item.id}/verify`}
                  label={t('reject')}
                  body={{ status: 'REJECTED' }}
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </details>
  );
}
export function AdminQueue({ support = false }: { support?: boolean }) {
  const { t, i18n } = useTranslation();
  const query = useApi<Queue>('/admin/queue');
  const [tab, setTab] = useState<'verifications' | 'disputes' | 'tickets'>(
    support ? 'tickets' : 'verifications',
  );
  const [q, setQ] = useState('');
  return (
    <>
      <PageHeading eyebrow="PLATFORM / OPERATIONS" title={t(support ? 'support' : 'queue')} />
      {!support && <SkillReviewQueue />}
      <div className="stat-grid">
        <div className="stat-card">
          <ShieldCheck />
          <span>{t('verification')}</span>
          <strong>{query.data?.verifications.length || 0}</strong>
        </div>
        <div className="stat-card">
          <FileCheck2 />
          <span>{t('dispute')}</span>
          <strong>{query.data?.disputes.length || 0}</strong>
        </div>
        <div className="stat-card">
          <Activity />
          <span>{t('support')}</span>
          <strong>{query.data?.tickets.length || 0}</strong>
        </div>
      </div>
      <div className="queue-toolbar">
        <div className="filter-chips">
          {(['verifications', 'disputes', 'tickets'] as const).map((value) => (
            <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
              {t(
                value === 'verifications'
                  ? 'verification'
                  : value === 'disputes'
                    ? 'dispute'
                    : 'support',
              )}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={17} />
          <span className="sr-only">{t('search')}</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t('search')}
          />
        </label>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {tab === 'verifications' ? (
          query.data?.verifications.length ? (
            <div className="record-list">
              {query.data.verifications
                .filter((item) => JSON.stringify(item).toLowerCase().includes(q.toLowerCase()))
                .map((item) => (
                  <article className="panel verification-row" key={item.id}>
                    <div>
                      <span className="eyebrow">{item.subjectType}</span>
                      <h3>{item.subjectId}</h3>
                      <p>{dateTime(item.createdAt, i18n.language)}</p>
                      <Status value={item.status} />
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                    <div className="form-actions">
                      <Action
                        reason
                        path={`/admin/verification/${item.id}`}
                        label={t('confirm')}
                        body={{ status: 'VERIFIED' }}
                        className="button button-primary compact"
                      />
                      <Action
                        reason
                        path={`/admin/verification/${item.id}`}
                        label={t('reject')}
                        body={{ status: 'REJECTED' }}
                      />
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <Empty />
          )
        ) : (query.data?.[tab].length || 0) > 0 ? (
          <div className="record-list">
            {query.data?.[tab]
              .filter((item) => JSON.stringify(item).toLowerCase().includes(q.toLowerCase()))
              .map((item) => (
                <article className="panel" key={item.id}>
                  <div className="record-heading">
                    <h2>{item.subject || item.category}</h2>
                    <Status value={item.status} />
                  </div>
                  <p>{item.description}</p>
                  <small>{dateTime(item.createdAt, i18n.language)}</small>
                  <details className="admin-resolution">
                    <summary>{t('resolve')}</summary>
                    <TextForm
                      path={`/admin/${tab === 'tickets' ? 'support' : 'disputes'}/${item.id}/resolve`}
                      label={t('resolve')}
                      fields={[{ name: 'resolution', label: 'reason', type: 'textarea' }]}
                    />
                  </details>
                </article>
              ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
interface FinanceQueue {
  pending: {
    id: string;
    status: string;
    provider: string;
    amountMinor: string;
    createdAt: string;
  }[];
  cases: {
    id: string;
    kind: string;
    status: string;
    invoiceId: string;
    transactionId: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    status: string;
    reason: string;
    amountMinor: string;
    createdAt: string;
  }[];
}
export function AdminBilling() {
  const { t, i18n } = useTranslation();
  const query = useApi<FinanceQueue>('/admin/billing');
  return (
    <>
      <PageHeading eyebrow="PLATFORM / FINANCE" title={t('billing')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className="section-heading compact-heading">
          <h2>{t('reconciliation')}</h2>
          <span>{query.data?.cases.length || 0}</span>
        </div>
        {query.data?.cases.length ? (
          <div className="record-list">
            {query.data.cases.map((item) => (
              <article className="record-card" key={item.id}>
                <FileCheck2 size={23} />
                <div>
                  <h3>{item.kind}</h3>
                  <p>Invoice · {item.invoiceId.slice(0, 12)}</p>
                  <p>{dateTime(item.createdAt, i18n.language)}</p>
                  <Status value={item.status} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
        <div className="section-heading compact-heading">
          <h2>{t('pendingPayments')}</h2>
        </div>
        <div className="record-list">
          {(query.data?.pending || []).map((item) => (
            <article className="record-card" key={item.id}>
              <Wallet size={24} />
              <div>
                <h3>
                  {item.provider} · {item.id.slice(0, 8)}
                </h3>
                <Status value={item.status} />
                <p>{dateTime(item.createdAt, i18n.language)}</p>
              </div>
              <strong>
                {money(item.amountMinor, i18n.language)} {t('currency')}
              </strong>
            </article>
          ))}
        </div>
        {!query.data?.pending.length && <Empty />}
        <div className="section-heading compact-heading">
          <h2>{t('refundHistory')}</h2>
        </div>
        {query.data?.refunds.length ? (
          <div className="record-list">
            {query.data.refunds.map((item) => (
              <article className="record-card" key={item.id}>
                <Wallet size={22} />
                <div>
                  <Status value={item.status} />
                  <p>{item.reason}</p>
                  <small>{dateTime(item.createdAt, i18n.language)}</small>
                </div>
                <strong>
                  {money(item.amountMinor, i18n.language)} {t('currency')}
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
export { AdminData } from './Management';
export function DeveloperPage() {
  const { t } = useTranslation();
  const query = useApi<unknown>('/health');
  const [devKey, setDevKey] = useState('');
  const [phone, setPhone] = useState('+998');
  const [data, setData] = useState<unknown>();
  const [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeading eyebrow="LOCAL / DEVELOPER" title={t('developer')} text={t('localOnly')} />
      <p className="notice">{t('localBanner')}</p>
      <div className="split-content">
        <section className="panel">
          <div className="record-heading">
            <h2>{t('system')}</h2>
            <Activity />
          </div>
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            <pre className="data-code">{JSON.stringify(query.data, null, 2)}</pre>
          </QueryState>
          <a className="button button-outline" href="/api/docs" target="_blank" rel="noreferrer">
            {t('apiDocs')}
            <ArrowUpRight size={18} />
          </a>
        </section>
        <section className="panel">
          <h2>{t('devInbox')}</h2>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                setError(undefined);
                setData(
                  await api(`/developer/inbox?phone=${encodeURIComponent(phone)}`, {
                    headers: { 'x-dev-key': devKey },
                  }),
                );
              } catch (e) {
                setError(e);
              }
            }}
          >
            <label>
              {t('devKey')}
              <input
                type="password"
                autoComplete="off"
                value={devKey}
                onChange={(event) => setDevKey(event.target.value)}
                required
              />
            </label>
            <label>
              {t('phone')}
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </label>
            <button className="button button-primary">{t('loadInbox')}</button>
            <p className="small muted">{t('devHint')}</p>
            {error !== undefined && <ErrorState error={error} />}
            {data !== undefined && <pre className="data-code">{JSON.stringify(data, null, 2)}</pre>}
          </form>
        </section>
      </div>
    </>
  );
}
