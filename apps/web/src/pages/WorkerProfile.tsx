import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Languages,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { ApiError, useAction, useApi, useSession } from '../api';
import type { Catalog, CatalogItem, WorkerProfile } from '../api';
import { ErrorState, Loading, PageHeading, Status } from '../components';
import { useWorkerProfileCopy, workerLanguageChoices } from '../profile-copy';
import { useProfileDraft } from '../profile-drafts';
import { PrivateFiles } from './Security';
import '../styles/worker-profile.css';

interface ProfileDetails extends WorkerProfile {
  adultConfirmed?: boolean;
  termsVersion?: string;
}
type Copy = ReturnType<typeof useWorkerProfileCopy>;
const makeSchema = (c: Copy) =>
  z.object({
    name: z.string().trim().min(2, c.requiredName).max(100, c.requiredName),
    cityId: z.string().uuid(c.requiredCity),
    categoryIds: z.array(z.string()).min(1, c.requiredRole).max(10, c.requiredRole),
    skillIds: z.array(z.string()).max(20, c.skillLimit),
    languages: z.array(z.string().min(2).max(30)).max(10, c.languageLimit),
    experience: z.string().max(2000, c.experienceLimit),
    adultConfirmed: z.boolean().refine(Boolean, c.requiredAdult),
    termsAccepted: z.boolean().refine(Boolean, c.requiredTerms),
  });
type ProfileForm = z.infer<ReturnType<typeof makeSchema>>;
const formValues = (profile: ProfileDetails | null, name: string): ProfileForm => ({
  name,
  cityId: profile?.cityId || '',
  categoryIds: profile?.categoryIds || [],
  skillIds: profile?.skills?.map((item) => item.skillId) || profile?.skillIds || [],
  languages: profile?.languages || [],
  experience: profile?.experience || '',
  adultConfirmed: profile?.adultConfirmed === true,
  termsAccepted: false,
});

export function WorkerProfilePage() {
  const c = useWorkerProfileCopy();
  const session = useSession();
  const profile = useApi<ProfileDetails | null>('/worker/profile');
  const catalog = useApi<Catalog>('/catalog');
  if (session.isPending || profile.isPending || catalog.isPending) return <Loading />;
  if (!session.data || profile.data === undefined || !catalog.data) {
    return (
      <ErrorState
        error={profile.error || catalog.error || session.error || new Error(c.missing)}
        retry={() => {
          void profile.refetch();
          void catalog.refetch();
          void session.refetch();
        }}
      />
    );
  }
  return (
    <div className="worker-resume">
      {(profile.error || catalog.error) && (
        <ErrorState
          error={profile.error || catalog.error}
          retry={() => {
            void profile.refetch();
            void catalog.refetch();
          }}
        />
      )}
      <ProfileWorkspace
        key={session.data.user.id}
        userId={session.data.user.id}
        profile={profile.data}
        catalog={catalog.data}
        name={session.data.user.name || ''}
        phone={session.data.user.phone}
      />
    </div>
  );
}

function ProfileWorkspace({
  userId,
  profile,
  catalog,
  name,
  phone,
}: {
  userId: string;
  profile: ProfileDetails | null;
  catalog: Catalog;
  name: string;
  phone: string;
}) {
  const c = useWorkerProfileCopy();
  const { i18n } = useTranslation();
  const localeKey = i18n.language === 'ru' ? 'nameRu' : 'nameUz';
  const id = useId();
  const {
    initialDraft,
    capture,
    clear: clearDraft,
  } = useProfileDraft<{
    values: ProfileForm;
    editing: boolean;
  }>(userId, 'worker/profile');
  const [editing, setEditing] = useState(initialDraft?.editing ?? !profile);
  const [notice, setNotice] = useState<'saved' | 'submitted'>();
  const mutation = useAction<ProfileDetails>('/worker/profile', 'PUT');
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setError,
    control,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(makeSchema(c)),
    defaultValues: formValues(profile, name),
    mode: 'onBlur',
  });
  const values = useWatch({ control });
  const experience = values.experience || '';
  useEffect(() => {
    if (initialDraft) reset(initialDraft.values, { keepDefaultValues: true });
  }, [initialDraft, reset]);
  useLayoutEffect(() => {
    capture(isDirty ? { values: getValues(), editing } : null);
  }, [capture, editing, getValues, isDirty, values]);
  const status = profile?.verificationStatus || 'UNVERIFIED';
  const restricted = status === 'SUSPENDED';
  const canSubmit = !['VERIFIED', 'PENDING', 'SUSPENDED'].includes(status);
  const skillIds = profile?.skills?.map((item) => item.skillId) || profile?.skillIds || [];
  const city = catalog.cities.find((item) => item.id === profile?.cityId);
  const categories =
    profile?.categoryIds.map(
      (categoryId) =>
        catalog.categories.find((item) => item.id === categoryId) || {
          id: categoryId,
          nameUz: c.archivedRole,
          nameRu: c.archivedRole,
        },
    ) || [];
  const skills = skillIds
    .map(
      (skillId) =>
        catalog.skills.find((item) => item.id === skillId) ||
        profile?.skills?.find((item) => item.skillId === skillId)?.skill,
    )
    .filter((item): item is CatalogItem => !!item);
  const languageOptions = [
    ...workerLanguageChoices,
    ...(profile?.languages || [])
      .filter((value) => !workerLanguageChoices.some((item) => item.id === value))
      .map((value) => ({ id: value, nameUz: value, nameRu: value })),
  ];
  const categoryOptions = [
    ...catalog.categories,
    ...categories.filter((item) => !catalog.categories.some((value) => value.id === item.id)),
  ];
  const checklist = [
    { label: c.name, complete: name.trim().length >= 2, section: 'identity' },
    { label: c.city, complete: !!profile?.cityId, section: 'identity' },
    { label: c.roles, complete: !!profile?.categoryIds.length, section: 'qualifications' },
    { label: c.skills, complete: skillIds.length > 0, section: 'qualifications' },
    { label: c.languages, complete: !!profile?.languages.length, section: 'experience' },
    { label: c.experience, complete: !!profile?.experience.trim(), section: 'experience' },
  ];
  const completeCount = checklist.filter((item) => item.complete).length;
  const verificationText =
    status === 'VERIFIED'
      ? c.verified
      : status === 'PENDING'
        ? c.pending
        : status === 'REJECTED'
          ? c.rejected
          : restricted
            ? c.suspended
            : c.unverified;
  const sectionId = (section: string) => `${id}-${section}`;
  const startEditing = (section = 'identity') => {
    if (restricted) return;
    if (!isDirty) reset(formValues(profile, name));
    setEditing(true);
    setNotice(undefined);
    mutation.reset();
    requestAnimationFrame(() => {
      const heading = document.getElementById(sectionId(section));
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
    });
  };
  useEffect(() => {
    if (!isDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [isDirty]);
  const save = async (data: ProfileForm, submit: boolean) => {
    setNotice(undefined);
    try {
      await mutation.mutateAsync({ ...data, submit });
      clearDraft();
      reset({ ...data, termsAccepted: false });
      setEditing(false);
      setNotice(submit ? 'submitted' : 'saved');
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        for (const field of Object.keys(error.fieldErrors)) {
          if (field in data)
            setError(field as keyof ProfileForm, { type: 'server', message: c.invalidServer });
        }
      }
    }
  };
  const cancel = () => {
    clearDraft();
    reset(formValues(profile, name));
    setEditing(false);
    mutation.reset();
    setNotice(undefined);
  };
  const fieldError = (field: keyof ProfileForm) =>
    errors[field] && (
      <p className="field-error" id={sectionId(`${field}-error`)} role="alert">
        {errors[field]?.message}
      </p>
    );
  const errorProps = (field: keyof ProfileForm, hint?: string) => ({
    'aria-invalid': !!errors[field],
    'aria-describedby':
      [hint, errors[field] ? sectionId(`${field}-error`) : undefined].filter(Boolean).join(' ') ||
      undefined,
  });

  return (
    <>
      <PageHeading
        eyebrow={profile ? c.savedView : c.newProfile}
        title={c.title}
        text={c.intro}
        action={
          !editing && !restricted ? (
            <button className="button button-primary" onClick={() => startEditing()}>
              <Pencil size={17} />
              {profile ? c.edit : c.create}
            </button>
          ) : undefined
        }
      />
      <div className="resume-tabs" role="group" aria-label={c.sectionNav}>
        <button
          type="button"
          aria-pressed={!editing}
          onClick={() => setEditing(false)}
          disabled={mutation.isPending}
        >
          <UserRound size={17} />
          {c.resume}
        </button>
        {!restricted && (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => startEditing()}
            disabled={mutation.isPending}
          >
            <Pencil size={16} />
            {c.edit}
            {isDirty && <span className="resume-dirty-dot" aria-label={c.dirty} />}
          </button>
        )}
      </div>
      {notice && (
        <p className="resume-success" role="status">
          <CheckCircle2 size={19} />
          {c[notice]}
        </p>
      )}
      {!editing && isDirty && (
        <div className="resume-draft-notice">
          <div>
            <strong>{c.dirty}</strong>
            <p>{c.draftHint}</p>
          </div>
          <button className="button button-outline compact" onClick={() => startEditing()}>
            {c.continueEdit}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="resume-layout">
        <div className="resume-main">
          {!editing ? (
            <>
              <section
                className="resume-identity panel"
                aria-labelledby={sectionId('overview-name')}
              >
                <div className="resume-cover" aria-hidden="true">
                  <span />
                  <i />
                  <span />
                </div>
                <div className="resume-identity-body">
                  <span className="resume-avatar" aria-hidden="true">
                    {name.trim() ? (
                      name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')
                        .toUpperCase()
                    ) : (
                      <UserRound size={31} />
                    )}
                  </span>
                  <div className="resume-name-row">
                    <div>
                      <span className="eyebrow">{profile ? c.savedView : c.newProfile}</span>
                      <h2 id={sectionId('overview-name')}>{name || c.unnamed}</h2>
                    </div>
                    <Status value={status} />
                  </div>
                  <div className="resume-contact">
                    <span>
                      <MapPin size={16} />
                      {city?.[localeKey] || c.missing}
                    </span>
                    <span>
                      <Phone size={16} />
                      {phone}
                    </span>
                  </div>
                  <p className="resume-phone-note">
                    <CheckCircle2 size={14} />
                    {c.phoneVerified}
                  </p>
                  {!profile && (
                    <div className="resume-new">
                      <h3>{c.newProfile}</h3>
                      <p>{c.newIntro}</p>
                      <button className="button button-primary" onClick={() => startEditing()}>
                        {c.create}
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <section className="panel resume-section">
                <div className="resume-section-heading">
                  <BriefcaseBusiness size={21} />
                  <h2>{c.qualifications}</h2>
                  {!restricted && (
                    <button
                      className="icon-button"
                      onClick={() => startEditing('qualifications')}
                      aria-label={`${c.edit}: ${c.qualifications}`}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </div>
                <h3>{c.roles}</h3>
                <div className="resume-tags">
                  {categories.length ? (
                    categories.map((item) => <span key={item.id}>{item[localeKey]}</span>)
                  ) : (
                    <p className="resume-missing">{c.missing}</p>
                  )}
                </div>
                <h3>{c.skills}</h3>
                <div className="resume-skill-list">
                  {skills.length ? (
                    skills.map((item) => (
                      <div key={item.id}>
                        <span>{item[localeKey]}</span>
                        <Status
                          value={
                            profile?.skills?.find((skill) => skill.skillId === item.id)?.status ||
                            'UNVERIFIED'
                          }
                        />
                      </div>
                    ))
                  ) : (
                    <p className="resume-missing">{c.missing}</p>
                  )}
                </div>
              </section>
              <section className="panel resume-section">
                <div className="resume-section-heading">
                  <FileText size={21} />
                  <h2>{c.experience}</h2>
                  {!restricted && (
                    <button
                      className="icon-button"
                      onClick={() => startEditing('experience')}
                      aria-label={`${c.edit}: ${c.experience}`}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </div>
                <p className={profile?.experience ? 'resume-experience' : 'resume-missing'}>
                  {profile?.experience || c.missing}
                </p>
                <h3 className="resume-language-heading">
                  <Languages size={18} />
                  {c.languages}
                </h3>
                <div className="resume-tags">
                  {profile?.languages.length ? (
                    profile.languages.map((value) => (
                      <span key={value}>
                        {languageOptions.find((item) => item.id === value)?.[localeKey] || value}
                      </span>
                    ))
                  ) : (
                    <p className="resume-missing">{c.missing}</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <form
              className="resume-editor"
              noValidate
              onSubmit={handleSubmit((data) => save(data, false))}
            >
              <fieldset disabled={mutation.isPending} className="resume-form-fields">
                <section className="panel resume-section">
                  <div className="resume-section-heading">
                    <span className="resume-section-number">01</span>
                    <h2 id={sectionId('identity')} tabIndex={-1}>
                      {c.identity}
                    </h2>
                  </div>
                  <p className="resume-section-hint">{c.identityHint}</p>
                  <div className="form-grid">
                    <div className="resume-field">
                      <label htmlFor={sectionId('name')}>{c.name}</label>
                      <input
                        id={sectionId('name')}
                        autoComplete="name"
                        {...register('name')}
                        {...errorProps('name')}
                      />
                      {fieldError('name')}
                    </div>
                    <div className="resume-field">
                      <label htmlFor={sectionId('cityId')}>{c.city}</label>
                      <select
                        id={sectionId('cityId')}
                        {...register('cityId')}
                        {...errorProps('cityId')}
                      >
                        <option value="">{c.choose}</option>
                        {profile?.cityId && !city && (
                          <option value={profile.cityId}>{c.archivedCity}</option>
                        )}
                        {catalog.cities.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item[localeKey]}
                          </option>
                        ))}
                      </select>
                      {fieldError('cityId')}
                    </div>
                  </div>
                  <div className="resume-readonly-contact">
                    <Phone size={17} />
                    <div>
                      <span>{c.phone}</span>
                      <strong>{phone}</strong>
                    </div>
                    <span>{c.phoneVerified}</span>
                  </div>
                </section>
                <section className="panel resume-section">
                  <div className="resume-section-heading">
                    <span className="resume-section-number">02</span>
                    <h2 id={sectionId('qualifications')} tabIndex={-1}>
                      {c.qualifications}
                    </h2>
                  </div>
                  <fieldset {...errorProps('categoryIds', sectionId('roles-hint'))}>
                    <legend>{c.roles}</legend>
                    <p id={sectionId('roles-hint')} className="resume-section-hint">
                      {c.rolesHint}
                    </p>
                    <div className="resume-choice-grid">
                      {categoryOptions.map((item) => (
                        <label className="resume-choice" key={item.id}>
                          <input
                            type="checkbox"
                            value={item.id}
                            {...register('categoryIds')}
                            {...errorProps('categoryIds')}
                          />
                          <span>{item[localeKey]}</span>
                          <Check size={15} aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                    {fieldError('categoryIds')}
                  </fieldset>
                  <fieldset {...errorProps('skillIds', sectionId('skills-hint'))}>
                    <legend>
                      {c.skills}
                      <span>{c.optional}</span>
                    </legend>
                    <p id={sectionId('skills-hint')} className="resume-section-hint">
                      {c.skillsHint}
                    </p>
                    <div className="resume-choice-grid">
                      {catalog.skills.map((item) => (
                        <label className="resume-choice" key={item.id}>
                          <input
                            type="checkbox"
                            value={item.id}
                            {...register('skillIds')}
                            {...errorProps('skillIds')}
                          />
                          <span>{item[localeKey]}</span>
                          <Check size={15} aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                    {fieldError('skillIds')}
                  </fieldset>
                </section>
                <section className="panel resume-section">
                  <div className="resume-section-heading">
                    <span className="resume-section-number">03</span>
                    <h2 id={sectionId('experience')} tabIndex={-1}>
                      {c.experienceSection}
                    </h2>
                  </div>
                  <fieldset {...errorProps('languages', sectionId('languages-hint'))}>
                    <legend>
                      {c.languages}
                      <span>{c.optional}</span>
                    </legend>
                    <p id={sectionId('languages-hint')} className="resume-section-hint">
                      {c.languagesHint}
                    </p>
                    <div className="resume-choice-grid language-choices">
                      {languageOptions.map((item) => (
                        <label className="resume-choice" key={item.id}>
                          <input
                            type="checkbox"
                            value={item.id}
                            {...register('languages')}
                            {...errorProps('languages')}
                          />
                          <span>{item[localeKey]}</span>
                          <Check size={15} aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                    {fieldError('languages')}
                  </fieldset>
                  <div className="resume-field">
                    <label htmlFor={sectionId('experience-input')}>
                      {c.experience}
                      <span>{c.optional}</span>
                    </label>
                    <p id={sectionId('experience-hint')} className="resume-section-hint">
                      {c.experienceHint}
                    </p>
                    <textarea
                      id={sectionId('experience-input')}
                      rows={6}
                      placeholder={c.experiencePlaceholder}
                      {...register('experience')}
                      {...errorProps('experience', sectionId('experience-hint'))}
                    />
                    <span className="resume-character-count">{experience.length} / 2000</span>
                    {fieldError('experience')}
                  </div>
                </section>
                <section className="panel resume-section">
                  <div className="resume-section-heading">
                    <span className="resume-section-number">04</span>
                    <h2 id={sectionId('consent')} tabIndex={-1}>
                      {c.consent}
                    </h2>
                  </div>
                  <p className="resume-section-hint">{c.consentHint}</p>
                  <label className="resume-consent">
                    <input
                      type="checkbox"
                      {...register('adultConfirmed')}
                      {...errorProps('adultConfirmed')}
                    />
                    <span>{c.adult}</span>
                  </label>
                  {fieldError('adultConfirmed')}
                  <label className="resume-consent">
                    <input
                      type="checkbox"
                      {...register('termsAccepted')}
                      {...errorProps('termsAccepted')}
                    />
                    <span>{c.terms}</span>
                  </label>
                  {fieldError('termsAccepted')}
                  <div className="resume-legal-links">
                    <Link to="/terms" target="_blank" rel="noopener noreferrer">
                      {c.termsLink}
                    </Link>
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                      {c.privacyLink}
                    </Link>
                  </div>
                </section>
              </fieldset>
              {mutation.error && <ErrorState error={mutation.error} />}
              <div className="resume-save-panel">
                <div className="resume-save-note">
                  <span className={isDirty ? 'has-changes' : ''}>
                    <span />
                    {isDirty ? c.dirty : profile ? c.savedView : c.newProfile}
                  </span>
                  <p>{c.saveHint}</p>
                </div>
                <div className="resume-save-actions">
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={mutation.isPending}
                  >
                    <Save size={17} />
                    {mutation.isPending ? c.saving : profile ? c.saveChanges : c.save}
                  </button>
                  {canSubmit && (
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={mutation.isPending}
                      onClick={() => void handleSubmit((data) => save(data, true))()}
                    >
                      <ShieldCheck size={17} />
                      {c.submit}
                    </button>
                  )}
                  <button
                    type="button"
                    className="resume-cancel"
                    disabled={mutation.isPending}
                    onClick={cancel}
                  >
                    {isDirty ? c.cancel : c.back}
                  </button>
                </div>
              </div>
            </form>
          )}
          <PrivateFiles />
        </div>
        <aside className="resume-aside">
          <section className="panel resume-completeness">
            <span className="eyebrow">{c.readiness}</span>
            <div className="resume-completeness-score">
              <strong>
                {completeCount}
                <small> / {checklist.length}</small>
              </strong>
              <span>{c.completed}</span>
            </div>
            <div
              className="resume-progress"
              role="progressbar"
              aria-label={c.readiness}
              aria-valuemin={0}
              aria-valuemax={checklist.length}
              aria-valuenow={completeCount}
            >
              <span style={{ width: `${(completeCount / checklist.length) * 100}%` }} />
            </div>
            <ul>
              {checklist.map((item) => (
                <li key={item.label}>
                  {item.complete ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                  {restricted ? (
                    <span>{item.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(item.section)}
                      disabled={mutation.isPending}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p>{c.readinessHint}</p>
          </section>
          <section className="panel resume-verification">
            <ShieldCheck size={24} />
            <h2>{c.verification}</h2>
            <Status value={status} />
            <p>{verificationText}</p>
            {canSubmit && !editing && (
              <button
                className="button button-outline compact"
                onClick={() => startEditing('consent')}
              >
                {c.submitShort}
                <ArrowRight size={16} />
              </button>
            )}
            {restricted && (
              <Link className="text-link" to="/help">
                {c.help}
                <ArrowRight size={16} />
              </Link>
            )}
          </section>
          <section className="resume-next">
            <CalendarDays size={23} />
            <h2>{c.availability}</h2>
            <p>{c.availabilityHint}</p>
            <Link to="/worker/availability">
              {c.availabilityLink}
              <ArrowRight size={17} />
            </Link>
            <Link to="/worker/shifts">
              {c.searchLink}
              <ArrowRight size={17} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
