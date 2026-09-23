import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ArrowUpRight, Clock3, Plus } from 'lucide-react';
import { list, useAction, useApi, useSession } from '../api';
import type { Assignment, Availability, Page, Shift, WorkerProfile } from '../api';
import {
  Action,
  Empty,
  Feedback,
  PageHeading,
  QueryState,
  ShiftCard,
  Status,
  dateOnly,
  dateTime,
  timeOnly,
} from '../components';

export const localToIso = (value: string) => new Date(`${value}:00+05:00`).toISOString();
export const availabilitySchema = z
  .object({ startAt: z.string().min(1), endAt: z.string().min(1) })
  .refine((value) => value.endAt > value.startAt, { path: ['endAt'], message: 'invalidInterval' });
export { WorkerProfilePage } from './WorkerProfile';
export function AvailabilityPage() {
  const { t, i18n } = useTranslation();
  const query = useApi<WorkerProfile>('/worker/profile');
  const mutation = useAction('/worker/availability');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { startAt: '', endAt: '' },
  });
  return (
    <>
      <PageHeading title={t('availability')} text={t('availabilityHint')} />
      <form
        className="panel form-stack"
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            { startAt: localToIso(data.startAt), endAt: localToIso(data.endAt) },
            { onSuccess: () => reset() },
          ),
        )}
      >
        <div className="form-grid">
          <label>
            {t('start')}
            <input type="datetime-local" {...register('startAt')} />
          </label>
          <label>
            {t('end')}
            <input type="datetime-local" {...register('endAt')} />
            {errors.endAt && <span className="field-error">{t('invalidInterval')}</span>}
          </label>
        </div>
        <p className="small muted">{t('timeZone')}</p>
        <button className="button button-primary align-start" disabled={mutation.isPending}>
          <Plus size={18} />
          {t('addAvailability')}
        </button>
        <Feedback error={mutation.error} success={mutation.isSuccess} />
      </form>
      <div className="section-heading compact-heading">
        <h2>{t('available')}</h2>
      </div>
      <QueryState pending={query.isPending} error={query.error}>
        {query.data?.availability?.length ? (
          <div className="record-list">
            {query.data.availability.map((item: Availability) => (
              <div className="record-card" key={item.id}>
                <Clock3 />
                <div>
                  <strong>{dateTime(item.startAt, i18n.language)}</strong>
                  <p>→ {dateTime(item.endAt, i18n.language)}</p>
                </div>
                <Action
                  path={`/worker/availability/${item.id}`}
                  label={t('remove')}
                  method="DELETE"
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
export function AssignmentsPage({
  employer = false,
  organizationId,
}: {
  employer?: boolean;
  organizationId?: string;
}) {
  const { t, i18n } = useTranslation();
  const query = useApi<Page<Assignment>>(
    employer ? `/organizations/${organizationId}/assignments` : '/worker/assignments',
    !employer || !!organizationId,
  );
  return (
    <>
      <PageHeading title={t(employer ? 'attendance' : 'assignments')} text={t('timeZone')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {list(query.data).length ? (
          <div className="record-list">
            {list(query.data).map((item) => (
              <article className="assignment-card panel" key={item.id}>
                <div className="assignment-date">
                  <strong>
                    {new Date(item.shift.startAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      timeZone: 'Asia/Tashkent',
                    })}
                  </strong>
                  <span>
                    {dateOnly(item.shift.startAt, i18n.language).split(' ').slice(1).join(' ')}
                  </span>
                </div>
                <div className="assignment-body">
                  <Status value={item.status} />
                  <h2>{item.shift.title}</h2>
                  <p>
                    {timeOnly(item.shift.startAt)} — {timeOnly(item.shift.endAt)} ·{' '}
                    {employer ? item.worker?.name : item.shift.organization.name}
                  </p>
                </div>
                <Link
                  className="button button-outline compact"
                  to={`/${employer ? 'employer' : 'worker'}/assignments/${item.id}`}
                >
                  {t('details')}
                  <ArrowUpRight size={17} />
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
export function FavoritesPage() {
  const { t } = useTranslation();
  const query = useApi<Page<Shift> | Shift[]>('/worker/favorites');
  return (
    <>
      <PageHeading title={t('favorites')} />
      <QueryState pending={query.isPending} error={query.error}>
        {list(query.data).length ? (
          <div className="shift-grid">
            {list(query.data).map((shift) => (
              <div key={shift.id}>
                <ShiftCard shift={shift} worker />
                <Action
                  method="DELETE"
                  path={`/worker/favorites/${shift.id}`}
                  label={t('remove')}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty
            action={
              <Link className="button button-primary" to="/worker/shifts">
                {t('findShift')}
              </Link>
            }
          />
        )}
      </QueryState>
    </>
  );
}
export function SettingsPage() {
  const { t } = useTranslation();
  const session = useSession();
  return (
    <>
      <PageHeading title={t('settings')} />
      <div className="panel form-stack">
        {session.data?.user.platformPermissions.length ? (
          <Link className="button button-outline align-start" to="/auth/mfa">
            {t('mfa')}
          </Link>
        ) : null}
        <h2>{t('privacy')}</h2>
        <p>{t('retention')}</p>
        <Action path="/account/requests" label={t('exportData')} body={{ type: 'EXPORT' }} />
        <Action
          path="/account/requests"
          label={t('deleteAccount')}
          body={{ type: 'DELETE' }}
          reason
        />
        <Link className="text-link" to="/terms">
          {t('terms')}
          <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
void useParams;
