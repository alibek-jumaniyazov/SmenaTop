import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import * as m from 'motion/react-m';
import { ApiError, api, useAction, useSession } from './api';
import type { Shift } from './api';
import { useNotificationsStream } from './notifications';
import { clearProfileDrafts } from './profile-drafts';

export function Logo({ onClick }: { onClick?: () => void } = {}) {
  return (
    <Link className="logo" to="/" aria-label="SmenaTop" onClick={onClick}>
      <img src="/logo.svg" width="38" height="38" alt="" />
      <span>
        Smena<span className="logo-light">Top</span>
      </span>
    </Link>
  );
}
const themeEvent = 'smenatop-theme-change';
const subscribeTheme = (listener: () => void) => {
  window.addEventListener(themeEvent, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener('storage', listener);
  };
};
export function LanguageTheme() {
  const { i18n, t } = useTranslation();
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => localStorage.getItem('smenatop-theme') === 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return (
    <div className="preferences">
      <button
        className="language"
        onClick={() => void i18n.changeLanguage(i18n.language === 'uz' ? 'ru' : 'uz')}
        aria-label={t('language')}
      >
        {i18n.language === 'uz' ? 'UZ' : 'RU'}
      </button>
      <button
        className="icon-button"
        onClick={() => {
          localStorage.setItem('smenatop-theme', dark ? 'light' : 'dark');
          window.dispatchEvent(new Event(themeEvent));
        }}
        aria-label={dark ? t('light') : t('dark')}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
export function PublicHeader() {
  const { t } = useTranslation();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  useEffect(() => {
    if (!window.matchMedia) return;
    const desktop = window.matchMedia('(min-width: 961px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const publicLinks = [
    ['/shifts', 'findShift'],
    ['/business', 'forBusiness'],
    ['/how-it-works', 'how'],
    ['/pricing', 'pricing'],
  ];
  return (
    <header className="public-header">
      <div className="container header-inner">
        <Logo />
        <nav className="public-nav" aria-label={t('navigation')}>
          {publicLinks.map(([url, key]) => (
            <NavLink key={url} to={url!}>
              {t(key!)}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <LanguageTheme />
          <Link className="button button-ink compact" to={session.data ? '/context' : '/auth'}>
            {session.data ? t('dashboard') : t('login')}
            <ArrowUpRight size={16} />
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={t('menu')}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <Modal
        title={t('menu')}
        open={open}
        onClose={() => setOpen(false)}
        id={menuId}
        className="public-navigation-dialog"
      >
        <div className="public-drawer-brand">
          <Logo onClick={() => setOpen(false)} />
          <span>{t('rights')}</span>
        </div>
        <nav className="public-drawer-links" aria-label={t('navigation')}>
          {publicLinks.map(([url, key], index) => (
            <NavLink key={url} to={url!} onClick={() => setOpen(false)}>
              <span className="drawer-link-number" aria-hidden="true">
                0{index + 1}
              </span>
              <span>{t(key!)}</span>
              <ArrowUpRight size={21} />
            </NavLink>
          ))}
        </nav>
        <div className="public-drawer-bottom">
          <Link
            className="button button-primary"
            to={session.data ? '/context' : '/auth'}
            onClick={() => setOpen(false)}
          >
            {session.data ? t('dashboard') : t('login')}
            <ArrowRight size={19} />
          </Link>
          <div className="drawer-preferences">
            <span>Asia/Tashkent · UZS</span>
            <LanguageTheme />
          </div>
        </div>
      </Modal>
    </header>
  );
}
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Logo />
            <p>{t('rights')}</p>
          </div>
          <div className="footer-links">
            <Link to="/workers">{t('forWorkers')}</Link>
            <Link to="/business">{t('forBusiness')}</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/help">{t('help')}</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} SmenaTop</span>
          <div>
            <Link to="/privacy">{t('privacy')}</Link>
            <Link to="/terms">{t('terms')}</Link>
          </div>
          <span>Asia/Tashkent · UZS</span>
        </div>
      </div>
    </footer>
  );
}
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}
export function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useTranslation();
  const good = [
    'VERIFIED',
    'CONFIRMED',
    'ACCEPTED',
    'PAID',
    'ACTIVE',
    'COMPLETED',
    'WORKER_CONFIRMED',
    'APPROVED',
    'CHECKED_IN',
  ];
  const bad = ['REJECTED', 'FAILED', 'SUSPENDED', 'DISPUTED'];
  return (
    <span
      className={`status ${good.includes(value) ? 'status-good' : bad.includes(value) ? 'status-bad' : ''}`}
    >
      <span className="status-dot" />
      {t(`status_${value}`, { defaultValue: value })}
    </span>
  );
}
export function Loading() {
  const { t } = useTranslation();
  return (
    <div className="loading-block" role="status" aria-label={t('loading')}>
      <div className="skeleton title-skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <CalendarDays size={30} />
      <h3>{title || t('empty')}</h3>
      <p>{text || t('emptyText')}</p>
      {action}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={20} />
      <div>
        <strong>
          {error instanceof ApiError && error.status === 403
            ? t('forbidden')
            : error instanceof ApiError && error.status === 401
              ? t('expired')
              : t('error')}
        </strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <button className="button button-outline compact" onClick={retry}>
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error: unknown;
  retry?: () => void;
  children: ReactNode;
}) {
  return pending ? (
    <Loading />
  ) : error ? (
    <ErrorState error={error} retry={retry} />
  ) : (
    <>{children}</>
  );
}
export function Feedback({ error, success }: { error?: unknown; success?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {error && <ErrorState error={error} />}
      <div aria-live="polite">
        {success && (
          <p className="success-line">
            <Check size={16} />
            {t('saved')}
          </p>
        )}
      </div>
    </>
  );
}
export const money = (amount: string | number, language = 'uz') =>
  new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'ru-RU', { maximumFractionDigits: 0 }).format(
    Number(amount) / 100,
  );
const uzMonths = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const uzWeekdays = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
const tashkentDate = (value: string) => new Date(new Date(value).getTime() + 5 * 3600000);
export const weekday = (value: string, language = 'uz') =>
  language === 'ru'
    ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'Asia/Tashkent' }).format(
        new Date(value),
      )
    : uzWeekdays[tashkentDate(value).getUTCDay()];
export const dateTime = (value: string, language = 'uz') =>
  language === 'ru'
    ? new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : tashkentDate(value).getUTCDate() +
      ' ' +
      uzMonths[tashkentDate(value).getUTCMonth()] +
      ', ' +
      timeOnly(value);
export const timeOnly = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export const dateOnly = (value: string, language = 'uz') =>
  language === 'ru'
    ? new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: 'numeric',
        month: 'long',
        weekday: 'short',
      }).format(new Date(value))
    : tashkentDate(value).getUTCDate() +
      ' ' +
      uzMonths[tashkentDate(value).getUTCMonth()] +
      ', ' +
      weekday(value, language);
export function ShiftCard({ shift, worker = false }: { shift: Shift; worker?: boolean }) {
  const { t, i18n } = useTranslation();
  const overnight =
    tashkentDate(shift.startAt).toISOString().slice(0, 10) !==
    tashkentDate(shift.endAt).toISOString().slice(0, 10);
  return (
    <m.article layout="position" transition={{ duration: 0.2 }} className="shift-card">
      <div className="shift-card-top">
        <span className="category-icon">
          <BriefcaseBusiness size={21} />
        </span>
        <div>
          <span className="shift-organization">
            {shift.organization?.name}
            {shift.organization?.verificationStatus === 'VERIFIED' && (
              <ShieldCheck size={15} aria-label={t('status_VERIFIED')} />
            )}
          </span>
          {shift.organization?.synthetic && <span className="sample-label">{t('sampleData')}</span>}
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={19} />
        </span>
      </div>
      <Link className="card-title" to={`${worker ? '/worker' : ''}/shifts/${shift.id}`}>
        <h3>{shift.title}</h3>
      </Link>
      <div className="shift-meta">
        <span>
          <CalendarDays size={15} />
          {dateOnly(shift.startAt, i18n.language)}
        </span>
        <span>
          <MapPin size={15} />
          {shift.branch?.area || shift.city?.[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
        </span>
      </div>
      <div
        className="time-strip small-strip"
        role="group"
        aria-label={`${t('shiftInterval')}: ${dateTime(shift.startAt, i18n.language)} — ${dateTime(shift.endAt, i18n.language)}`}
      >
        <span>
          <Clock3 size={14} />
          {timeOnly(shift.startAt)}
        </span>
        <div aria-hidden="true" />
        <span>
          {timeOnly(shift.endAt)}
          {overnight && <small title={t('nextDay')}>+1</small>}
        </span>
      </div>
      <div className="shift-card-bottom">
        <div>
          <strong>{money(shift.amountMinor, i18n.language)}</strong>{' '}
          <span className="small">{t('currency')}</span>
          <span className="pay-basis">{t(shift.payType === 'HOURLY' ? 'perHour' : 'fixed')}</span>
        </div>
        <span className="places">
          <Users size={14} />
          {Math.max(0, shift.headcount - (shift.filledCount || 0))} {t('places')}
        </span>
      </div>
    </m.article>
  );
}
export function Modal({
  title,
  open,
  onClose,
  children,
  className,
  id,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { t } = useTranslation();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={`modal ${className || ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby={titleId}
      aria-modal="true"
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label={t('close')}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Action({
  path,
  label,
  body = {},
  method = 'POST',
  reason = false,
  className = 'button button-outline compact',
}: {
  path: string;
  label: string;
  body?: unknown;
  method?: string;
  reason?: boolean;
  className?: string;
}) {
  const mutation = useAction(path, method);
  const [open, setOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const { t } = useTranslation();
  return (
    <>
      <button
        className={className}
        disabled={mutation.isPending}
        onClick={() => (reason ? setOpen(true) : mutation.mutate(body))}
      >
        {mutation.isPending ? t('loading') : label}
      </button>
      <Feedback error={!open ? mutation.error : undefined} success={mutation.isSuccess} />
      {reason && (
        <Modal open={open} onClose={() => setOpen(false)} title={label}>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(
                { ...(body as Record<string, unknown>), reason: reasonText },
                { onSuccess: () => setOpen(false) },
              );
            }}
          >
            <Feedback error={mutation.error} />
            <label>
              {t('reason')}
              <textarea
                autoFocus
                required
                minLength={3}
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
              />
            </label>
            <button className="button button-primary" disabled={mutation.isPending}>
              {t('confirm')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Shell({
  zone,
  children,
}: {
  zone: 'worker' | 'employer' | 'admin' | 'developer';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const session = useSession();
  useNotificationsStream(!!session.data);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>();
  const [loggingOut, setLoggingOut] = useState(false);
  const menuId = useId();
  useEffect(() => {
    if (!window.matchMedia) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setExpanded(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const links =
    zone === 'worker'
      ? [
          [CalendarDays, 'today', ''],
          [Search, 'findShift', '/shifts'],
          [Heart, 'favorites', '/favorites'],
          [Users, 'applications', '/applications'],
          [Clock3, 'assignments', '/assignments'],
          [Wallet, 'wages', '/wages'],
          [MessageSquare, 'messages', '/messages'],
          [Bell, 'notifications', '/notifications'],
          [SlidersHorizontal, 'availability', '/availability'],
          [ShieldCheck, 'profile', '/profile'],
          [SlidersHorizontal, 'settings', '/settings'],
        ]
      : zone === 'employer'
        ? [
            [LayoutDashboard, 'dashboard', ''],
            [Building2, 'organizationProfile', '/profile'],
            [CalendarDays, 'calendar', '/calendar'],
            [Users, 'applications', '/applications'],
            [Clock3, 'attendance', '/assignments'],
            [Wallet, 'wages', '/wages'],
            [Building2, 'team', '/team'],
            [Wallet, 'billing', '/billing'],
            [MessageSquare, 'messages', '/messages'],
            [Bell, 'notifications', '/notifications'],
            [LayoutDashboard, 'analytics', '/analytics'],
          ]
        : zone === 'admin'
          ? [
              [ShieldCheck, 'queue', ''],
              [Wallet, 'billing', '/billing'],
              [MessageSquare, 'support', '/support'],
              [SlidersHorizontal, 'catalogs', '/catalogs'],
              [Clock3, 'audit', '/audit'],
              [LayoutDashboard, 'system', '/health'],
            ]
          : [
              [LayoutDashboard, 'system', ''],
              [MessageSquare, 'devInbox', '/inbox'],
            ];
  const sidebarContent = () => (
    <>
      <div className="sidebar-brand">
        <Logo onClick={() => setExpanded(false)} />
      </div>
      <Link className="workspace-switch" to="/context" onClick={() => setExpanded(false)}>
        <span className="workspace-avatar">
          {zone === 'employer' ? <Building2 size={18} /> : <Users size={18} />}
        </span>
        <span>
          {t(zone)}
          <small>{session.data?.user.name || session.data?.user.phone}</small>
        </span>
        <SlidersHorizontal size={15} />
      </Link>
      <nav aria-label={t('navigation')}>
        {links.map(([Icon, key, url]) => {
          const NavIcon = Icon as typeof CalendarDays;
          return (
            <NavLink end to={`/${zone}${url}`} key={String(key)} onClick={() => setExpanded(false)}>
              <NavIcon size={19} />
              <span>{t(String(key))}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <Link to="/help" onClick={() => setExpanded(false)}>
          <CircleAlert size={17} />
          {t('help')}
        </Link>
        <button
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true);
            setLogoutError(undefined);
            try {
              await api('/auth/logout', { method: 'POST' });
              clearProfileDrafts();
              setExpanded(false);
              qc.clear();
              navigate('/');
            } catch (error) {
              setLogoutError(error);
            } finally {
              setLoggingOut(false);
            }
          }}
        >
          <LogOut size={17} />
          {t(loggingOut ? 'loading' : 'logout')}
        </button>
        {!!logoutError && <ErrorState error={logoutError} />}
        <LanguageTheme />
      </div>
    </>
  );
  return (
    <div className={`workspace ${zone}-workspace`}>
      <aside className={`sidebar ${expanded ? 'expanded' : ''}`}>{sidebarContent()}</aside>
      <Modal
        title={t('navigation')}
        open={expanded}
        onClose={() => setExpanded(false)}
        id={menuId}
        className="workspace-navigation-dialog"
      >
        <div className="workspace-drawer">{sidebarContent()}</div>
      </Modal>
      <div className="workspace-content">
        <header className="workspace-header">
          <button
            className="icon-button mobile-menu"
            onClick={() => setExpanded(true)}
            aria-label={t('menu')}
            aria-expanded={expanded}
            aria-controls={menuId}
          >
            <Menu />
          </button>
          <span className="workspace-breadcrumb">
            <span className="workspace-zone-dot" />
            {t(zone)} <span className="header-separator">/</span> <strong>SmenaTop</strong>
          </span>
          <div>
            <span className="timezone-desktop">UTC+5 · UZS</span>
            {(zone === 'worker' || zone === 'employer') && (
              <Link
                className="icon-button"
                aria-label={t('notifications')}
                to={`/${zone}/notifications`}
              >
                <Bell size={19} />
              </Link>
            )}
            <Link
              className="profile-avatar"
              to={zone === 'worker' || zone === 'employer' ? `/${zone}/profile` : '/context'}
              aria-label={t('profile')}
            >
              {(session.data?.user.name || 'S').slice(0, 1)}
            </Link>
          </div>
        </header>
        <main id="main-content" className="workspace-main">
          {children}
        </main>
      </div>
      {(zone === 'worker' || zone === 'employer') && (
        <nav className="bottom-nav" aria-label={t('navigation')}>
          {(zone === 'worker'
            ? [
                [CalendarDays, 'today', ''],
                [Search, 'search', '/shifts'],
                [Clock3, 'assignments', '/assignments'],
                [Users, 'profile', '/profile'],
              ]
            : [
                [LayoutDashboard, 'dashboard', ''],
                [CalendarDays, 'calendar', '/calendar'],
                [Users, 'applications', '/applications'],
                [Building2, 'organizationProfile', '/profile'],
              ]
          ).map(([Icon, key, url]) => {
            const NavIcon = Icon as typeof CalendarDays;
            return (
              <NavLink key={String(key)} end to={`/${zone}${url}`}>
                <span className="bottom-nav-icon">
                  <NavIcon size={21} />
                </span>
                <span>{t(String(key))}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
export function Steps() {
  const { t } = useTranslation();
  return (
    <div className="steps">
      {[1, 2, 3].map((n) => {
        const Icon = [Search, CalendarDays, Wallet][n - 1]!;
        return (
          <article key={n}>
            <div className="step-top">
              <span className="step-icon">
                <Icon size={25} />
              </span>
              <span className="step-number">0{n}</span>
            </div>
            <h3>{t(`step${n}Title`)}</h3>
            <p>{t(`step${n}Text`)}</p>
          </article>
        );
      })}
    </div>
  );
}
export function InlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
