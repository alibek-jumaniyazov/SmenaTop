import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Send,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { list, useAction, useApi, useSession } from '../api';
import type { Assignment, Billing, Message, Notification, Page, Plan, Wage } from '../api';
import {
  Action,
  Empty,
  Feedback,
  Modal,
  PageHeading,
  QueryState,
  Status,
  dateTime,
  money,
} from '../components';

export function TextForm({
  path,
  label,
  fields,
  body = {},
}: {
  path: string;
  label: string;
  fields: { name: string; label: string; type?: string; options?: string[] }[];
  body?: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const mutation = useAction(path);
  const shape = Object.fromEntries(
    fields.map((field) => [field.name, z.string().min(field.type === 'number' ? 1 : 3)]),
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Record<string, string>>({ resolver: zodResolver(z.object(shape)) });
  return (
    <form
      className="form-stack"
      onSubmit={handleSubmit((data) => {
        const values: Record<string, unknown> = { ...data, ...body };
        for (const field of fields)
          if (field.type === 'number') values[field.name] = Number(values[field.name]);
        mutation.mutate(values, { onSuccess: () => reset() });
      })}
    >
      {fields.map((field) => (
        <label key={field.name}>
          {t(field.label)}
          {field.type === 'select' ? (
            <select aria-label={t(field.label)} {...register(field.name)}>
              {field.options?.map((option) => (
                <option value={option} key={option}>
                  {t('dispute_' + option)}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea {...register(field.name)} rows={4} />
          ) : (
            <input
              type={field.type || 'text'}
              min={field.type === 'number' ? 1 : undefined}
              max={field.name === 'rating' ? 5 : undefined}
              {...register(field.name)}
            />
          )}{' '}
          {errors[field.name] && <span className="field-error">{t('required')}</span>}
        </label>
      ))}
      <button className="button button-primary align-start" disabled={mutation.isPending}>
        {label}
        <ArrowRight size={17} />
      </button>
      <Feedback error={mutation.error} success={mutation.isSuccess} />
    </form>
  );
}
interface AttendanceData {
  assignment: Assignment;
  timesheet: {
    status: string;
    workedMinutes?: number;
    payableMinutes?: number;
    paidMinutes?: number;
    workerApprovedAt?: string;
    managerApprovedAt?: string;
    approvedAt?: string;
  } | null;
  wage: Wage | null;
  events: { id: string; kind: string; recordedAt: string; method: string }[];
}
export function AssignmentDetail({ employer = false }: { employer?: boolean }) {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [token, setToken] = useState('');
  const [reason, setReason] = useState('');
  const [modal, setModal] = useState<'dispute' | 'review' | null>(null);
  const query = useApi<AttendanceData>(`/assignments/${id}/attendance`);
  const attendance = useAction(`/assignments/${id}/attendance`);
  const createToken = useAction<{ token: string; expiresAt: string }>(
    `/assignments/${id}/attendance-token`,
  );
  const item = query.data?.assignment;
  return (
    <>
      <Link className="back-link" to={`/${employer ? 'employer' : 'worker'}/assignments`}>
        ← {t('assignments')}
      </Link>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {item && (
          <>
            <PageHeading
              eyebrow={item.shift.organization.name}
              title={item.shift.title}
              text={dateTime(item.shift.startAt, i18n.language)}
            />
            <div className="detail-layout">
              <div className="detail-main">
                <section className="panel">
                  <div className="record-heading">
                    <h2>{t('attendance')}</h2>
                    <Status value={item.status} />
                  </div>
                  <div className="attendance-summary">
                    <Clock3 />
                    <strong>
                      {dateTime(item.shift.startAt, i18n.language)} →{' '}
                      {dateTime(item.shift.endAt, i18n.language)}
                    </strong>
                  </div>
                  {['CONFIRMED', 'CHECKED_IN'].includes(item.status) && (
                    <div className="form-stack">
                      {employer ? (
                        <>
                          <label>
                            {t('manualReason')}
                            <input
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                            />
                          </label>
                          <div className="form-actions">
                            <button
                              className="button button-primary"
                              disabled={attendance.isPending || reason.trim().length < 3}
                              onClick={() =>
                                attendance.mutate({
                                  kind: item.status === 'CONFIRMED' ? 'CHECK_IN' : 'CHECK_OUT',
                                  reason,
                                })
                              }
                            >
                              {t(item.status === 'CONFIRMED' ? 'checkIn' : 'checkOut')}
                            </button>
                            <button
                              className="button button-outline"
                              disabled={createToken.isPending}
                              onClick={() =>
                                createToken.mutate({
                                  kind: item.status === 'CONFIRMED' ? 'CHECK_IN' : 'CHECK_OUT',
                                })
                              }
                            >
                              {t('createToken')}
                            </button>
                          </div>
                          {createToken.data && (
                            <div className="token-result">
                              <label>
                                {t('attendanceToken')}
                                <textarea readOnly value={createToken.data.token} />
                              </label>
                              <small>{dateTime(createToken.data.expiresAt, i18n.language)}</small>
                            </div>
                          )}
                          <Feedback error={createToken.error} />
                        </>
                      ) : (
                        <>
                          <label>
                            {t('attendanceToken')}
                            <input
                              autoComplete="off"
                              value={token}
                              onChange={(event) => setToken(event.target.value)}
                            />
                          </label>
                          <button
                            className="button button-primary"
                            disabled={attendance.isPending || !token}
                            onClick={() =>
                              attendance.mutate(
                                {
                                  kind: item.status === 'CONFIRMED' ? 'CHECK_IN' : 'CHECK_OUT',
                                  token,
                                },
                                { onSuccess: () => setToken('') },
                              )
                            }
                          >
                            {t(item.status === 'CONFIRMED' ? 'checkIn' : 'checkOut')}
                            <CheckCircle2 size={18} />
                          </button>
                        </>
                      )}
                      <Feedback error={attendance.error} success={attendance.isSuccess} />
                    </div>
                  )}
                  {query.data?.events.length ? (
                    <ol className="event-list">
                      {query.data.events.map((event) => (
                        <li key={event.id}>
                          <CheckCircle2 size={17} />
                          <div>
                            <strong>
                              {t(`status_${event.kind}`, { defaultValue: event.kind })}
                            </strong>
                            <p>{dateTime(event.recordedAt, i18n.language)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </section>
                <section className="panel">
                  <h2>{t('timesheet')}</h2>
                  {query.data?.timesheet ? (
                    <>
                      <Status value={query.data.timesheet.status} />
                      <p>
                        {query.data.timesheet.paidMinutes ??
                          query.data.timesheet.payableMinutes ??
                          query.data.timesheet.workedMinutes ??
                          0}{' '}
                        {t('minute')}
                      </p>
                      {(employer
                        ? !query.data.timesheet.managerApprovedAt
                        : !query.data.timesheet.workerApprovedAt) && (
                        <Action
                          path={`/assignments/${id}/timesheet/approve`}
                          label={t('approveTimesheet')}
                        />
                      )}
                    </>
                  ) : (
                    <Empty />
                  )}
                </section>
                <section className="panel">
                  <div className="record-heading">
                    <h2>{t('messages')}</h2>
                    <MessageSquare size={21} />
                  </div>
                  <MessageThread assignmentId={id!} />
                </section>
              </div>
              <aside className="detail-side">
                <section className="panel">
                  <span className="eyebrow">{t('pay')}</span>
                  <div className="pay-large">
                    {money(query.data?.wage?.amountMinor || item.shift.amountMinor, i18n.language)}
                    <span>{t('currency')}</span>
                  </div>
                  {!query.data?.wage && (
                    <p className="small muted">
                      {t(item.shift.payType === 'HOURLY' ? 'perHour' : 'fixed')}
                    </p>
                  )}
                  {query.data?.wage && <Status value={query.data.wage.status} />}
                  <p className="small muted">{t('workerPayNote')}</p>
                  {employer && query.data?.wage?.status === 'APPROVED' && (
                    <Action
                      reason
                      path={`/assignments/${id}/wage/mark-paid`}
                      label={t('markPaid')}
                    />
                  )}{' '}
                  {!employer && query.data?.wage?.status === 'EMPLOYER_MARKED_PAID' && (
                    <Action
                      path={`/assignments/${id}/wage/confirm`}
                      label={t('confirmPaid')}
                      className="button button-primary"
                    />
                  )}
                </section>
                <section className="panel form-stack">
                  {employer && item.status === 'CONFIRMED' && (
                    <Action reason path={`/assignments/${id}/no-show`} label={t('noShow')} />
                  )}
                  {['CONFIRMED', 'CHECKED_IN'].includes(item.status) && (
                    <Action reason path={`/assignments/${id}/cancel`} label={t('cancel')} />
                  )}
                  <button className="button button-outline" onClick={() => setModal('dispute')}>
                    {t('dispute')}
                  </button>
                  {['COMPLETED', 'CHECKED_OUT'].includes(item.status) && (
                    <button className="button button-outline" onClick={() => setModal('review')}>
                      {t('review')}
                    </button>
                  )}
                </section>
              </aside>
            </div>
            <Modal
              open={modal !== null}
              onClose={() => setModal(null)}
              title={t(modal || 'details')}
            >
              {modal === 'dispute' ? (
                <TextForm
                  path={`/assignments/${id}/disputes`}
                  label={t('send')}
                  fields={[
                    {
                      name: 'category',
                      label: 'category',
                      type: 'select',
                      options: ['ATTENDANCE', 'PAYMENT', 'CONDUCT', 'OTHER'],
                    },
                    { name: 'description', label: 'description', type: 'textarea' },
                  ]}
                />
              ) : (
                <TextForm
                  path={`/assignments/${id}/reviews`}
                  label={t('send')}
                  fields={[
                    { name: 'rating', label: 'rating', type: 'number' },
                    { name: 'text', label: 'text', type: 'textarea' },
                  ]}
                />
              )}
            </Modal>
          </>
        )}
      </QueryState>
    </>
  );
}
export function WagePage({ organizationId }: { organizationId?: string }) {
  const { t, i18n } = useTranslation();
  const query = useApi<Wage[]>(
    organizationId ? `/organizations/${organizationId}/wages` : '/worker/wages',
  );
  const wages = query.data || [];
  const total = (states: string[]) =>
    wages
      .filter((w) => states.includes(w.status))
      .reduce((sum, w) => sum + Number(w.amountMinor), 0);
  return (
    <>
      <PageHeading title={t('wages')} text={t('workerPayNote')} />
      <div className="stat-grid wage-stats">
        {[
          ['calculated', ['CALCULATED', 'APPROVED']],
          ['employerMarked', ['EMPLOYER_MARKED_PAID']],
          ['workerConfirmed', ['WORKER_CONFIRMED']],
        ].map(([key, statuses]) => (
          <div className="stat-card" key={String(key)}>
            <Wallet />
            <span>{t(String(key))}</span>
            <strong>
              {money(total(statuses as string[]), i18n.language)} <small>{t('currency')}</small>
            </strong>
          </div>
        ))}
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {wages.length ? (
          <div className="record-list">
            {wages.map((wage) => (
              <article className="record-card" key={wage.id}>
                <Wallet size={24} />
                <div>
                  <h3>{wage.assignment?.shift.title}</h3>
                  <Status value={wage.status} />
                </div>
                <strong className="record-amount">
                  {money(wage.amountMinor, i18n.language)} {t('currency')}
                </strong>
                <Link
                  className="button button-outline compact"
                  to={`/${organizationId ? 'employer' : 'worker'}/assignments/${wage.assignmentId || wage.assignment.id}`}
                >
                  {t('details')}
                  <ArrowUpRight size={16} />
                </Link>
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
export function MessageThread({ assignmentId }: { assignmentId: string }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const query = useApi<Message[]>(`/assignments/${assignmentId}/messages`);
  const mutation = useAction(`/assignments/${assignmentId}/messages`);
  const [message, setMessage] = useState('');
  return (
    <>
      <QueryState pending={query.isPending} error={query.error}>
        <div className="message-list" aria-live="polite">
          {query.data?.length ? (
            query.data.map((item) => (
              <div
                className={`message ${item.senderId === session.data?.user.id ? 'own' : ''}`}
                key={item.id}
              >
                <span>{item.sender?.name}</span>
                <p>{item.text}</p>
                <small>{dateTime(item.createdAt, i18n.language)}</small>
              </div>
            ))
          ) : (
            <Empty title={t('messages')} />
          )}
        </div>
      </QueryState>
      <form
        className="message-compose"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ text: message }, { onSuccess: () => setMessage('') });
        }}
      >
        <label className="sr-only" htmlFor={`message-${assignmentId}`}>
          {t('text')}
        </label>
        <input
          id={`message-${assignmentId}`}
          required
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('text')}
        />
        <button
          className="button button-primary"
          aria-label={t('send')}
          disabled={mutation.isPending || !message.trim()}
        >
          <Send size={18} />
        </button>
      </form>
      <Feedback error={mutation.error} />
    </>
  );
}
export function MessagesPage({ organizationId }: { organizationId?: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState('');
  const query = useApi<Page<Assignment>>(
    organizationId ? `/organizations/${organizationId}/assignments` : '/worker/assignments',
  );
  return (
    <>
      <PageHeading title={t('messages')} />
      <div className="messages-layout panel">
        <aside>
          {list(query.data).map((item) => (
            <button
              className={selected === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => setSelected(item.id)}
            >
              <MessageSquare size={20} />
              <span>
                <strong>{item.shift.title}</strong>
                <small>{item.shift.organization.name}</small>
              </span>
            </button>
          ))}
        </aside>
        <section>
          {selected ? <MessageThread assignmentId={selected} /> : <Empty title={t('noMessages')} />}
        </section>
      </div>
    </>
  );
}
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const query = useApi<Notification[]>('/notifications');
  return (
    <>
      <PageHeading title={t('notifications')} />
      <QueryState pending={query.isPending} error={query.error}>
        {query.data?.length ? (
          <div className="record-list">
            {query.data.map((item) => (
              <article
                className={`notification-card panel ${item.readAt ? '' : 'unread'}`}
                key={item.id}
              >
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <small>{dateTime(item.createdAt, i18n.language)}</small>
                </div>
                {!item.readAt && (
                  <Action path={`/notifications/${item.id}/read`} label={t('markRead')} />
                )}
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
export function BillingPage({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const query = useApi<Billing>(`/organizations/${organizationId}/billing`);
  const plans = useApi<Plan[]>('/billing/plans');
  const checkout = useAction<{
    invoice: { id: string };
    attempt: { id: string };
    checkoutUrl?: string;
  }>(`/organizations/${organizationId}/billing/checkout`);
  const [selectedProvider, setSelectedProvider] = useState('MOCK');
  const providers = query.data?.providers || [];
  const available = providers.find((p) => p.id === selectedProvider);
  return (
    <>
      <PageHeading title={t('billing')} text={t('noAutoDebit')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className="billing-status panel">
          <span className="billing-symbol">
            <ShieldCheck size={30} />
          </span>
          <div>
            <span className="eyebrow">{t('currentSubscription')}</span>
            <h2>
              <Status value={query.data?.subscription?.status || 'UNVERIFIED'} />
            </h2>
            {query.data?.subscription?.currentPeriodEnd && (
              <p>{dateTime(query.data.subscription.currentPeriodEnd, i18n.language)}</p>
            )}
          </div>
          {query.data?.subscription && (
            <Action
              path={`/organizations/${organizationId}/billing/cancel`}
              label={t(
                query.data.subscription.cancelAtPeriodEnd ? 'restoreRenewal' : 'cancelRenewal',
              )}
              body={{ cancelAtPeriodEnd: !query.data.subscription.cancelAtPeriodEnd }}
            />
          )}
        </div>
        <div className="section-heading compact-heading">
          <h2>{t('pricing')}</h2>
          <label className="inline-select">
            {t('provider')}
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id} · {t(`status_${provider.status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {available?.status === 'LOCAL_MOCK' && <p className="notice">{t('mockPayment')}</p>}
        {available?.reason && <p className="notice">{available.reason}</p>}
        <div className="pricing-grid">
          {plans.data?.map((plan, index) => {
            const v = plan.versions[0];
            return (
              <article className={`price-card ${index === 1 ? 'featured' : ''}`} key={plan.id}>
                <span className="eyebrow">{plan.code}</span>
                <h2>{plan.name}</h2>
                <div className="price-amount">
                  {money(v.priceMinor, i18n.language)}
                  <small> {t('currency')}</small>
                </div>
                <p>{t('monthly')}</p>
                <ul className="check-list">
                  <li>
                    <CheckCircle2 />
                    {v.publishLimit} {t('quota')}
                  </li>
                  <li>
                    <CheckCircle2 />
                    {v.branchLimit} {t('branchLimit')}
                  </li>
                  <li>
                    <CheckCircle2 />
                    {v.memberLimit} {t('members')}
                  </li>
                </ul>
                <button
                  className="button button-primary"
                  disabled={
                    checkout.isPending ||
                    !available?.capabilities.checkout ||
                    available.status === 'NOT_CONFIGURED'
                  }
                  onClick={() =>
                    checkout.mutate(
                      { planVersionId: v.id, provider: selectedProvider },
                      {
                        onSuccess: (result) => {
                          if (result.checkoutUrl) {
                            const url = new URL(result.checkoutUrl, location.origin);
                            if (url.protocol === 'https:' || url.origin === location.origin)
                              location.assign(url.href);
                          }
                        },
                      },
                    )
                  }
                >
                  {t('checkout')}
                  <ArrowRight size={17} />
                </button>
              </article>
            );
          })}
        </div>
        <Feedback error={checkout.error} success={checkout.isSuccess} />
        {checkout.data?.attempt && selectedProvider === 'MOCK' && (
          <div className="panel">
            <p className="notice">{t('mockPayment')}</p>
            <Action
              path={`/developer/payments/${checkout.data.attempt.id}/simulate`}
              label={t('simulateSuccess')}
              body={{ scenario: 'success' }}
            />
          </div>
        )}
        <div className="section-heading compact-heading">
          <h2>{t('invoices')}</h2>
        </div>
        {query.data?.invoices.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>{t('date')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('status')}</th>
                  <th>{t('provider')}</th>
                </tr>
              </thead>
              <tbody>
                {query.data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <code>{invoice.id.slice(0, 8)}</code>
                    </td>
                    <td>{dateTime(invoice.createdAt, i18n.language)}</td>
                    <td>
                      {money(invoice.amountMinor, i18n.language)} {t('currency')}
                    </td>
                    <td>
                      <Status value={invoice.status} />
                    </td>
                    <td>
                      {invoice.attempts.map((attempt) => (
                        <div key={attempt.id}>
                          <span>{attempt.provider} </span>
                          <Status value={attempt.status} />
                          {attempt.provider === 'MOCK' && attempt.status === 'PENDING' && (
                            <Action
                              path={`/developer/payments/${attempt.id}/simulate`}
                              label={t('simulateSuccess')}
                              body={{ scenario: 'success' }}
                            />
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
