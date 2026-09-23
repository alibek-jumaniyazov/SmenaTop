import { useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { list, useApi, useSession } from '../api';
import type { Page, Shift } from '../api';
import {
  Action,
  PageHeading,
  QueryState,
  Status,
  dateTime,
  money,
  timeOnly,
  weekday,
} from '../components';

export function useOrganization() {
  const session = useSession();
  const [params] = useSearchParams();
  const id = params.get('org') || sessionStorage.getItem('smenatop-org');
  return (
    session.data?.memberships.find((m) => m.organizationId === id) || session.data?.memberships[0]
  );
}
export { OrganizationOnboarding, ShiftForm } from './EmployerForms';
const calendarMobileQuery = '(max-width: 767px)';
const subscribeCalendarViewport = (listener: () => void) => {
  const media = window.matchMedia?.(calendarMobileQuery);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
};
const isCalendarMobile = () => window.matchMedia?.(calendarMobileQuery).matches ?? false;
const calendarDate = (date: string | number) =>
  new Date(new Date(date).getTime() + 5 * 3600000).toISOString().slice(0, 10);
export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const orgId = useOrganization()?.organizationId;
  const query = useApi<Page<Shift>>(`/organizations/${orgId}/shifts`, !!orgId);
  const [day, setDay] = useState(() => calendarDate(Date.now()));
  const mobile = useSyncExternalStore(subscribeCalendarViewport, isCalendarMobile);
  const [chosenMode, setMode] = useState<'day' | 'week'>();
  const mode = chosenMode ?? (mobile ? 'day' : 'week');
  const [selection, setSelected] = useState<Shift>();
  const selectedShift = list(query.data).find((item) => item.id === selection?.id) || selection;
  const days = Array.from({ length: mode === 'week' ? 7 : 1 }, (_, n) =>
    new Date(new Date(`${day}T12:00:00+05:00`).getTime() + n * 86400000).toISOString().slice(0, 10),
  );
  const selected =
    selectedShift && days.includes(calendarDate(selectedShift.startAt)) ? selectedShift : undefined;
  const move = (direction: number) =>
    setDay(
      new Date(
        new Date(`${day}T12:00:00Z`).getTime() + direction * (mode === 'week' ? 7 : 1) * 86400000,
      )
        .toISOString()
        .slice(0, 10),
    );
  return (
    <>
      <PageHeading
        title={t('calendar')}
        text={t('timeZone')}
        action={
          <Link className="button button-primary" to="/employer/shifts/new">
            <Plus size={18} />
            {t('newShift')}
          </Link>
        }
      />
      <div className="calendar-toolbar">
        <div>
          <button className="icon-button" aria-label={t('previous')} onClick={() => move(-1)}>
            <ChevronLeft />
          </button>
          <label>
            <span className="sr-only">{t('date')}</span>
            <input
              type="date"
              value={day}
              onChange={(event) => {
                if (event.target.value) setDay(event.target.value);
              }}
            />
          </label>
          <button className="icon-button" aria-label={t('next')} onClick={() => move(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="segmented">
          <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>
            {t('day')}
          </button>
          <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
            {t('week')}
          </button>
        </div>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className={`calendar-layout ${selected ? 'has-selection' : ''}`}>
          <div
            className="calendar-scroll"
            role="region"
            aria-label={`${t('calendar')} · ${t(mode)}`}
            tabIndex={mode === 'week' ? 0 : undefined}
          >
            <div className={`calendar-grid ${mode === 'day' ? 'single-day' : ''}`}>
              {days.map((date) => {
                const dayShifts = list(query.data).filter(
                  (shift) => calendarDate(shift.startAt) === date,
                );
                return (
                  <div className="calendar-day" key={date}>
                    <div className="calendar-day-head">
                      <span>{weekday(`${date}T12:00:00+05:00`, i18n.language)}</span>
                      <strong>{date.slice(-2)}</strong>
                    </div>
                    <div className="calendar-day-body">
                      {dayShifts.map((shift, index) => (
                        <button
                          className={`calendar-block block-${index % 3} ${selected?.id === shift.id ? 'selected' : ''}`}
                          key={shift.id}
                          onClick={() => setSelected(shift)}
                        >
                          <span>
                            {timeOnly(shift.startAt)}—{timeOnly(shift.endAt)}
                            {calendarDate(shift.startAt) !== calendarDate(shift.endAt) && (
                              <small className="calendar-next-day" title={t('nextDay')}>
                                +1
                              </small>
                            )}
                          </span>
                          <strong>{shift.title}</strong>
                          <small>
                            {shift.filledCount || 0}/{shift.headcount} · {shift.branch?.name}
                          </small>
                          <Status value={shift.status} />
                        </button>
                      ))}
                      {mode === 'day' && dayShifts.length === 0 && (
                        <div className="calendar-day-empty">
                          <CalendarDays size={25} />
                          <p>{t('noShiftsThisDay')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {selected && (
            <aside className="calendar-details panel">
              <button className="text-button" onClick={() => setSelected(undefined)}>
                ← {t('close')}
              </button>
              <span className="eyebrow">{selected.branch?.name}</span>
              <h2>{selected.title}</h2>
              <Status value={selected.status} />
              <p>
                {dateTime(selected.startAt, i18n.language)} →{' '}
                {dateTime(selected.endAt, i18n.language)}
              </p>
              <strong className="calendar-pay">
                {money(selected.amountMinor, i18n.language)} {t('currency')}
              </strong>
              <p>{selected.description}</p>
              <div className="form-stack">
                <Link className="button button-outline" to={`/employer/shifts/${selected.id}/edit`}>
                  {t('details')}
                  <ArrowUpRight size={17} />
                </Link>
                {selected.status === 'IN_PROGRESS' && (
                  <Action
                    reason
                    path={`/organizations/${orgId}/shifts/${selected.id}/early-close`}
                    label={t('earlyClose')}
                  />
                )}
                {selected.status === 'COMPLETED' && (
                  <Action
                    reason
                    path={`/organizations/${orgId}/shifts/${selected.id}/close`}
                    label={t('close')}
                  />
                )}
                {selected.status === 'DRAFT' && (
                  <Action
                    path={`/organizations/${orgId}/shifts/${selected.id}/publish`}
                    label={t('publish')}
                    className="button button-primary"
                  />
                )}
                {['DRAFT', 'PUBLISHED'].includes(selected.status) && (
                  <Action
                    reason
                    path={`/organizations/${orgId}/shifts/${selected.id}/cancel`}
                    label={t('cancel')}
                  />
                )}
              </div>
            </aside>
          )}
        </div>
      </QueryState>
    </>
  );
}
export { TeamPage, AnalyticsPage } from './Management';
