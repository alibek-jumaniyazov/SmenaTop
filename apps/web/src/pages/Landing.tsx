import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Coffee,
  Layers3,
  MapPin,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Sunset,
  Moon,
  Wallet,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useApi } from '../api';
import type { Catalog, Page, Shift } from '../api';
import { Empty, PublicLayout, QueryState, ShiftCard, Steps } from '../components';
import { Reveal } from '../components/Reveal';
import { landingCopy } from './landing-copy';

type LandingText = (typeof landingCopy)['uz'] | (typeof landingCopy)['ru'];
const periods = [
  { key: 'morning', time: '10:00—14:00', icon: Sun },
  { key: 'afternoon', time: '12:00—17:00', icon: Sunset },
  { key: 'evening', time: '16:00—21:00', icon: Moon },
] as const;

function DayPlanner({ copy }: { copy: LandingText }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(1);
  const period = periods[selected]!;
  return (
    <div className="hero-stage">
      <div className="stage-orbit orbit-one" aria-hidden="true" />
      <div className="stage-orbit orbit-two" aria-hidden="true" />
      <div className="stage-spark" aria-hidden="true">
        <Sparkles />
      </div>
      <div className="planner-callout callout-top">
        <span>
          <BadgeCheck size={20} />
        </span>
        <div>
          {copy.allClear}
          <small>{copy.noRush}</small>
        </div>
      </div>
      <div className="time-demo planner">
        <div className="planner-topline">
          <span className="demo-label">
            <i />
            {t('sample')}
          </span>
          <span>UTC+5</span>
        </div>
        <div className="planner-heading">
          <div>
            <span>{copy.plannerSubtitle}</span>
            <h2>
              {copy.planner}
              <span className="heading-dot">.</span>
            </h2>
          </div>
          <div className="planner-mark">
            <CalendarDays size={24} />
          </div>
        </div>
        <div className="planner-days" aria-hidden="true">
          {copy.weekdays.map((day, index) => (
            <span key={index} className={index === 2 ? 'chosen' : ''}>
              <small>{day}</small>
              <strong>{index + 12}</strong>
              {index === 2 && <i />}
            </span>
          ))}
        </div>
        <div className="planner-timeline">
          <div className="timeline-rule" aria-hidden="true">
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
          </div>
          <div className="planner-personal">
            <Coffee size={18} />
            <div>
              {copy.personal}
              <small>08:00 — 10:00</small>
            </div>
          </div>
          <div key={period.key} className="demo-shift planner-shift" data-period={period.key}>
            <div className="planner-shift-top">
              <span className="planner-work-icon">
                <BriefcaseBusiness size={19} />
              </span>
              <span>
                {copy.shift}
                <small>{t('sampleData')}</small>
              </span>
              <ArrowUpRight size={21} />
            </div>
            <strong className="planner-time">{period.time}</strong>
            <div className="planner-shift-bottom">
              <span>
                <MapPin size={13} />
                Toshkent
              </span>
              <span>
                <CheckCheck size={15} />
                {copy.payment}
              </span>
            </div>
          </div>
          <div className="planner-free">
            <span />
            <span>{t('available')}</span>
            <span>•••</span>
          </div>
        </div>
        <div className="planner-periods">
          <span>{copy.timeChoice}</span>
          <div className="demo-controls" role="group" aria-label={t('chooseTime')}>
            {periods.map(({ key, icon: Icon }, index) => (
              <button
                key={key}
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                <Icon size={16} />
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        <div className="planner-confirm" aria-live="polite" aria-atomic="true">
          <span className="confirm-icon">
            <Check size={15} />
          </span>
          <span>
            <span className="sr-only">
              {t(period.key)}, {period.time}.{' '}
            </span>
            {t('fits')}
          </span>
          <ArrowUpRight size={15} />
        </div>
      </div>
      <div className="planner-callout callout-bottom">
        <span>
          <Clock3 size={21} />
        </span>
        <div>
          {copy.schedule}
          <small>{copy.offer}</small>
        </div>
      </div>
      <div className="planner-caption">
        <span>01 — 03</span>
        <span>{t('demoNote')}</span>
      </div>
    </div>
  );
}

function WeekIllustration({ copy }: { copy: LandingText }) {
  return (
    <div className="week-illustration" aria-hidden="true">
      <div className="week-heading">
        <CalendarDays size={17} />
        {copy.week}
        <span>•••</span>
      </div>
      <div className="week-columns">
        {copy.weekdays.slice(0, 5).map((day, index) => (
          <div key={index}>
            <span>{day}</span>
            <div className={'week-slot slot-' + index}>
              {index === 1 ? (
                <Coffee size={15} />
              ) : index === 2 ? (
                <BriefcaseBusiness size={17} />
              ) : index === 4 ? (
                <Sparkles size={16} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="week-legend">
        <span>
          <i />
          {copy.study}
        </span>
        <span>
          <i />
          {copy.shift}
        </span>
        <span>
          <i />
          {copy.life}
        </span>
      </div>
    </div>
  );
}

function BusinessPreview({ copy }: { copy: LandingText }) {
  return (
    <div className="business-preview" aria-label={copy.businessPreview}>
      <div className="preview-top">
        <div className="preview-symbol">
          S<span />
        </div>
        <span>
          SmenaTop <strong>Business</strong>
        </span>
        <span className="preview-more">•••</span>
      </div>
      <div className="preview-body">
        <div className="preview-heading">
          <div>
            <span>{copy.businessPreview}</span>
            <h3>{copy.weekPlan}</h3>
          </div>
          <span className="preview-calendar-icon">
            <CalendarDays size={19} />
          </span>
        </div>
        <div className="preview-calendar" aria-hidden="true">
          {copy.weekdays.slice(0, 5).map((day, index) => (
            <div className="preview-column" key={index}>
              <span>{day}</span>
              <div className={'preview-event preview-event-' + index}>
                {index % 2 ? <Clock3 size={13} /> : <Check size={13} />}
                <strong>{index % 2 ? '12:00' : '09:00'}</strong>
                <small>{copy.shift}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="preview-summary">
          <div className="preview-avatars">
            <span>A</span>
            <span>M</span>
            <span>S</span>
          </div>
          <div>
            <strong>{copy.team}</strong>
            <span>{copy.planned}</span>
          </div>
          <span className="summary-check">
            <CheckCheck size={19} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const { t, i18n } = useTranslation();
  const copy = landingCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const [category, setCategory] = useState('');
  const [showMobileAction, setShowMobileAction] = useState(false);
  const heroActions = useRef<HTMLDivElement>(null);
  const catalog = useApi<Catalog>('/catalog');
  const query = useApi<Page<Shift>>(
    '/shifts?pageSize=3' + (category ? '&categoryId=' + encodeURIComponent(category) : ''),
  );
  useEffect(() => {
    const element = heroActions.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setShowMobileAction(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <PublicLayout>
      <div className="landing-v2">
        <div className="landing-progress" aria-hidden="true" />
        <section className="hero container">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="brand-pulse" />
              {copy.eyebrow}
            </div>
            <h1>
              {copy.headingA}
              <br />
              <span>
                {copy.headingB}
                <svg viewBox="0 0 490 18" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M4 13C138 2 337 2 486 11" />
                </svg>
              </span>
            </h1>
            <p className="hero-intro">{copy.intro}</p>
            <div className="hero-actions" ref={heroActions}>
              <Link className="button button-primary hero-primary" to="/shifts">
                {t('findShift')}
                <ArrowUpRight size={20} />
              </Link>
              <Link className="button button-outline" to="/auth?intent=employer">
                {t('hire')}
                <ArrowRight size={19} />
              </Link>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={15} />
                {t('freeWorker')}
              </span>
              <span>
                <ShieldCheck size={16} />
                {t('transparent')}
              </span>
            </div>
            <a className="hero-discover" href="#opportunities">
              <span>
                <ArrowDown size={16} />
              </span>
              {copy.scroll}
            </a>
          </div>
          <DayPlanner copy={copy} />
        </section>
        <section className="promise-strip container" aria-label={t('how')}>
          {[
            { icon: Clock3, title: copy.flexibility, text: copy.flexibilityText },
            { icon: ShieldCheck, title: copy.clarity, text: copy.clarityText },
            { icon: Layers3, title: copy.control, text: copy.controlText },
          ].map(({ icon: Icon, title, text }, index) => (
            <div className="promise-item" key={title}>
              <span className="promise-icon">
                <Icon size={23} />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
              <small>{'0' + (index + 1)}</small>
            </div>
          ))}
        </section>
        <section id="opportunities" className="opportunities-section container">
          <Reveal className="landing-section-heading">
            <div>
              <span className="section-kicker">
                <span />
                {copy.opportunity}
              </span>
              <h2>
                {copy.opportunitiesA}
                <br />
                <span>{copy.opportunitiesB}</span>
              </h2>
              <p>{copy.opportunitiesText}</p>
            </div>
            <Link className="button button-outline" to="/shifts">
              {t('allShifts')}
              <ArrowUpRight size={18} />
            </Link>
          </Reveal>
          <div className="opportunity-filters" role="group" aria-label={t('category')}>
            <span className="filter-indicator">
              <SlidersHorizontal size={17} />
            </span>
            <button aria-pressed={!category} onClick={() => setCategory('')}>
              {copy.all}
            </button>
            {catalog.data?.categories.map((item) => (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
              </button>
            ))}
          </div>
          {catalog.isError && (
            <div className="catalog-feedback" role="status">
              <span>{copy.categoriesUnavailable}</span>
              <button onClick={() => void catalog.refetch()} disabled={catalog.isFetching}>
                {t('retry')}
              </button>
            </div>
          )}
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            {query.data?.items.length ? (
              <div className="shift-grid landing-shifts">
                {query.data.items.slice(0, 3).map((shift) => (
                  <ShiftCard shift={shift} key={shift.id} />
                ))}
              </div>
            ) : (
              <Empty title={t('emptyShifts')} text={t('emptyShiftsText')} />
            )}
          </QueryState>
        </section>
        <section className="benefits-section container">
          <Reveal className="landing-section-heading centered-heading">
            <div>
              <span className="section-kicker">
                <span />
                {copy.benefitsLabel}
              </span>
              <h2>
                {copy.details}
                <br />
                <span>{copy.difference}</span>
              </h2>
            </div>
          </Reveal>
          <div className="benefit-grid">
            <Reveal className="benefit-card benefit-balance">
              <span className="benefit-icon">
                <CalendarDays size={24} />
              </span>
              <h3>
                {copy.balance}
                <br />
                {copy.balanceLine}
              </h3>
              <p>{copy.balanceText}</p>
              <WeekIllustration copy={copy} />
            </Reveal>
            <Reveal className="benefit-card benefit-clarity" delay={70}>
              <span className="benefit-icon">
                <Wallet size={24} />
              </span>
              <h3>
                {copy.before}
                <br />
                {copy.after}
              </h3>
              <p>{copy.clarityCardText}</p>
              <div className="clarity-checklist">
                {[copy.payTime, copy.requirements, copy.employer].map((text, index) => (
                  <div key={text} style={{ '--item-index': index } as CSSProperties}>
                    <span>
                      <Check size={15} />
                    </span>
                    {text}
                    <ChevronRight size={15} />
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal className="benefit-card benefit-consent" delay={140}>
              <span className="benefit-icon">
                <BadgeCheck size={25} />
              </span>
              <h3>
                {copy.consentA}
                <br />
                {copy.consentB}
              </h3>
              <p>{copy.consentText}</p>
              <div className="consent-illustration" aria-hidden="true">
                <span className="consent-path" />
                <div className="consent-envelope">
                  <BriefcaseBusiness size={28} />
                </div>
                <div className="consent-check">
                  <CheckCheck size={29} />
                </div>
                <span className="consent-spark">
                  <Sparkles size={18} />
                </span>
              </div>
            </Reveal>
          </div>
        </section>
        <section id="how-it-works" className="landing-how container">
          <Reveal className="landing-section-heading">
            <div>
              <span className="section-kicker">
                <span />
                {copy.stepsLabel}
              </span>
              <h2>{copy.stepsTitle}</h2>
            </div>
            <p>{copy.stepsText}</p>
          </Reveal>
          <Reveal>
            <Steps />
          </Reveal>
        </section>
        <section className="business-section container">
          <Reveal className="business-feature">
            <div className="business-copy">
              <span className="section-kicker">
                <span />
                {copy.businessLabel}
              </span>
              <h2>
                {copy.businessA}
                <br />
                <span>{copy.businessB}</span>
              </h2>
              <p>{copy.businessText}</p>
              <div className="business-actions">
                <Link className="button button-mint" to="/auth?intent=employer">
                  {t('createOrg')}
                  <ArrowUpRight size={19} />
                </Link>
                <Link className="business-plans-link" to="/pricing">
                  {copy.seePlans}
                  <ArrowRight size={17} />
                </Link>
              </div>
              <small>{t('noGuarantee')}</small>
            </div>
            <BusinessPreview copy={copy} />
          </Reveal>
        </section>
        <section className="landing-faq container">
          <Reveal className="faq-intro">
            <span className="section-kicker">
              <span />
              {copy.faqLabel}
            </span>
            <h2>{copy.faqTitle}</h2>
            <p>{copy.faqSubtitle}</p>
            <Link className="text-link" to="/help">
              {t('help')}
              <ArrowUpRight size={18} />
            </Link>
          </Reveal>
          <div className="faq-questions">
            {copy.questions.map(([question, answer], index) => (
              <Reveal key={question} delay={index * 40}>
                <details className="faq-item">
                  <summary>
                    <span>{question}</span>
                    <Plus size={19} />
                  </summary>
                  <p>{answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="final-section container">
          <Reveal className="final-cta">
            <div className="final-orbit" aria-hidden="true" />
            <span className="final-spark" aria-hidden="true">
              <Sparkles />
            </span>
            <span className="final-label">{copy.free}</span>
            <h2>
              {copy.finalA}
              <br />
              {copy.finalB}
            </h2>
            <p>{copy.finalText}</p>
            <Link className="button button-cream" to="/shifts">
              {t('findShift')}
              <ArrowUpRight size={20} />
            </Link>
          </Reveal>
        </section>
        <div
          className={'landing-mobile-action ' + (showMobileAction ? 'is-visible' : '')}
          inert={!showMobileAction}
        >
          <span>
            <span className="brand-pulse" />
            {copy.mobileNote}
          </span>
          <Link to="/shifts">
            {copy.mobileAction}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
