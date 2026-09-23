import { useEffect, useLayoutEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Globe,
  KeyRound,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ApiError, api, list, useAction, useApi, useSession } from '../api';
import { useProfileDraft } from '../profile-drafts';
import type { Branch, Catalog, Membership, Organization, Page } from '../api';
import {
  Action,
  Empty,
  ErrorState,
  Feedback,
  Loading,
  Modal,
  QueryState,
  Status,
  dateTime,
} from '../components';
import { useOrganization } from './Employer';
import { localToIso } from './Worker';
import { PrivateFiles } from './Security';
import { organizationProfileCopy } from './organization-profile-copy';
import type { OrganizationProfileCopy } from './organization-profile-copy';
import '../styles/organization-profile.css';

interface Company extends Organization {
  contactName: string;
  stir?: string | null;
  cityId: string;
  version: number;
  description?: string | null;
  website?: string | null;
  contactPhone?: string | null;
  status: string;
  branches?: (Branch & { active?: boolean; cityId?: string })[];
  memberships?: (Membership & { status?: string })[];
}
interface SubscriptionSummary {
  subscription: {
    status: string;
    effectiveStatus?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  effectiveEntitlement: {
    endsAt: string;
    planVersion: { branchLimit: number; memberLimit: number; publishLimit: number };
  } | null;
}
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
}
type Draft = {
  name: string;
  contactName: string;
  stir: string;
  cityId: string;
  description: string;
  website: string;
  contactPhone: string;
};
type Editor = { draft: Draft; baseline: Draft; version: number };
type Field = keyof Draft;
type FieldErrors = Partial<Record<Field, string>>;
const fields: Field[] = [
  'name',
  'cityId',
  'stir',
  'contactName',
  'contactPhone',
  'website',
  'description',
];
const toDraft = (company: Company): Draft => ({
  name: company.name,
  contactName: company.contactName,
  stir: company.stir || '',
  cityId: company.cityId,
  description: company.description || '',
  website: company.website || '',
  contactPhone: company.contactPhone || '',
});
function validWebsite(value: string) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    );
  } catch {
    return false;
  }
}
function validate(draft: Draft, copy: OrganizationProfileCopy): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.name.trim().length < 2 || draft.name.trim().length > 150)
    errors.name = copy.invalidName;
  if (draft.contactName.trim().length < 2 || draft.contactName.trim().length > 100)
    errors.contactName = copy.invalidContact;
  if (!draft.cityId) errors.cityId = copy.invalidCity;
  if (draft.stir.trim() && !/^\d{9}$/.test(draft.stir.trim())) errors.stir = copy.invalidStir;
  if (draft.contactPhone.trim() && !/^\+[1-9]\d{7,14}$/.test(draft.contactPhone.trim()))
    errors.contactPhone = copy.invalidPhone;
  if (
    draft.website.trim() &&
    (draft.website.trim().length > 500 || !validWebsite(draft.website.trim()))
  )
    errors.website = copy.invalidWebsite;
  if (draft.description.length > 3000) errors.description = copy.invalidDescription;
  return errors;
}
function Section({
  id,
  title,
  hint,
  icon,
  action,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="org-profile-section">
      <div className="org-section-heading">
        <div className="org-section-title">
          {icon}
          <div>
            <h2>{title}</h2>
            {hint && <p>{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OrganizationSettings() {
  const { i18n } = useTranslation();
  const copy = organizationProfileCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const membership = useOrganization();
  const session = useSession();
  if (!membership || !session.data)
    return (
      <div className="organization-profile">
        <h1>{copy.title}</h1>
        <Empty
          title={copy.noOrg}
          text={copy.noOrgText}
          action={
            <div className="form-actions">
              <Link className="button button-primary" to="/context">
                {copy.chooseOrg}
              </Link>
              <Link className="button button-outline" to="/employer/onboarding">
                {copy.createOrg}
              </Link>
            </div>
          }
        />
      </div>
    );
  return (
    <CompanyProfile
      key={`${session.data.user.id}:${membership.organizationId}`}
      userId={session.data.user.id}
      membership={membership}
    />
  );
}

function CompanyProfile({ membership, userId }: { membership: Membership; userId: string }) {
  const { t, i18n } = useTranslation();
  const copy = organizationProfileCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const path = `/organizations/${membership.organizationId}`;
  const query = useApi<Company>(path);
  const catalog = useApi<Catalog>('/catalog');
  const client = useQueryClient();
  const branchScope = (membership as Membership & { branchIds?: string[] }).branchIds ?? [];
  const scoped = membership.role === 'MANAGER' || branchScope.length > 0;
  const permission = (value: string) => !scoped && membership.permissions.includes(value);
  const canManage = permission('organization.manage');
  const canBilling = permission('billing.read');
  const canTeam = permission('member.invite') || permission('branch.manage');
  const canKeys = permission('api.manage');
  const billing = useApi<SubscriptionSummary>(`${path}/billing`, canBilling);
  const verify = useAction(`${path}/verification`);
  const { initialDraft, capture, clear: clearDraft } = useProfileDraft<Editor>(userId, path);
  const [editor, setEditor] = useState<Editor | null>(initialDraft ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const dirty = !!editor && fields.some((field) => editor.draft[field] !== editor.baseline[field]);
  useLayoutEffect(() => {
    capture(dirty ? editor : null);
  }, [capture, dirty, editor]);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Company>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: async (company) => {
      clearDraft();
      client.setQueryData(['api', path], company);
      setEditor(null);
      setErrors({});
      setSaved(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['api', path], exact: true }),
        client.invalidateQueries({ queryKey: ['session'] }),
      ]);
    },
  });
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  const company = query.data;
  const canEdit =
    canManage && company?.status === 'ACTIVE' && company.verificationStatus !== 'SUSPENDED';
  const startEditing = (field: Field = 'name') => {
    if (!company || !canEdit) return;
    const draft = toDraft(company);
    setEditor({ draft, baseline: draft, version: company.version });
    setSaved(false);
    setErrors({});
    save.reset();
    requestAnimationFrame(() => document.getElementById(`org-field-${field}`)?.focus());
  };
  const discard = () => {
    clearDraft();
    setEditor(null);
    setDiscardOpen(false);
    setErrors({});
    save.reset();
  };
  const change = (field: Field, value: string) => {
    setEditor((current) =>
      current ? { ...current, draft: { ...current.draft, [field]: value } } : null,
    );
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const stale = !!editor && company?.version !== editor.version;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor || !canEdit || !dirty || stale || save.isPending) return;
    const nextErrors = validate(editor.draft, copy);
    setErrors(nextErrors);
    const firstError = fields.find((field) => nextErrors[field]);
    if (firstError) {
      document.getElementById(`org-field-${firstError}`)?.focus();
      return;
    }
    const draft = editor.draft;
    save.mutate({
      version: editor.version,
      name: draft.name.trim(),
      cityId: draft.cityId,
      contactName: draft.contactName.trim(),
      stir: draft.stir.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      website: draft.website.trim() || null,
      description: draft.description.trim() || null,
    });
  };
  const cityName = catalog.data?.cities.find((city) => city.id === company?.cityId)?.[
    i18n.language === 'ru' ? 'nameRu' : 'nameUz'
  ];
  const branches = (company?.branches ?? []).filter(
    (branch) => branch.active !== false && (!scoped || branchScope.includes(branch.id)),
  );
  const activeMembers =
    company?.memberships?.filter((member) => member.status === 'ACTIVE').length ?? 0;
  const checklist: { label: string; done: boolean; field?: Field }[] = [
    { label: copy.checklistName, done: !!company?.name.trim(), field: 'name' },
    { label: copy.checklistCity, done: !!company?.cityId, field: 'cityId' },
    { label: copy.checklistContact, done: !!company?.contactName?.trim(), field: 'contactName' },
    {
      label: copy.checklistChannel,
      done: !!(company?.contactPhone || company?.website),
      field: 'contactPhone',
    },
    { label: copy.checklistAbout, done: !!company?.description?.trim(), field: 'description' },
    {
      label: copy.checklistBranch,
      done: branches.some((branch) => !!branch.address?.trim() && !!branch.area?.trim()),
    },
  ];
  const complete = checklist.filter((item) => item.done).length;
  const roleName =
    (
      {
        OWNER: copy.roleOwner,
        ADMIN: copy.roleAdmin,
        MANAGER: copy.roleManager,
        FINANCE: copy.roleFinance,
        CUSTOM: copy.roleCustom,
      } as Record<string, string>
    )[membership.role] || copy.roleCustom;
  const editButton = (field: Field, label: string) =>
    canEdit && !editor ? (
      <button
        type="button"
        className="org-edit-section"
        aria-label={`${copy.edit}: ${label}`}
        onClick={() => startEditing(field)}
      >
        <Pencil size={16} />
        <span>{copy.edit}</span>
      </button>
    ) : null;
  const field = (
    name: Field,
    label: string,
    hint?: string,
    options: { required?: boolean; maxLength?: number; type?: string } = {},
  ) => (
    <div className="org-form-field">
      <label htmlFor={`org-field-${name}`}>
        {label}
        {!options.required && <span>{copy.optional}</span>}
      </label>
      <input
        id={`org-field-${name}`}
        value={editor?.draft[name] || ''}
        onChange={(event) => change(name, event.target.value)}
        type={options.type || 'text'}
        required={options.required}
        maxLength={options.maxLength}
        autoComplete={
          name === 'name'
            ? 'organization'
            : name === 'contactName'
              ? 'name'
              : name === 'contactPhone'
                ? 'tel'
                : name === 'website'
                  ? 'url'
                  : 'off'
        }
        inputMode={name === 'stir' ? 'numeric' : name === 'contactPhone' ? 'tel' : undefined}
        aria-invalid={!!errors[name]}
        aria-describedby={
          `${hint ? `org-hint-${name} ` : ''}${errors[name] ? `org-error-${name}` : ''}`.trim() ||
          undefined
        }
      />
      {hint && (
        <p id={`org-hint-${name}`} className="org-field-hint">
          {hint}
        </p>
      )}
      {errors[name] && (
        <p id={`org-error-${name}`} className="field-error">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="organization-profile">
      <header className="org-profile-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <Link className="org-context-link" to="/context">
          {copy.chooseOrg}
          <ArrowRight size={17} />
        </Link>
      </header>
      {query.isPending && !company ? (
        <Loading />
      ) : !company ? (
        <ErrorState
          error={query.error || new Error(copy.noOrgText)}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          <section className="org-profile-overview">
            <div className="org-company-avatar" aria-hidden="true">
              <Building2 size={32} />
            </div>
            <div className="org-company-intro">
              <h2>{company.name}</h2>
              <div className="org-company-meta">
                {cityName && (
                  <span>
                    <MapPin size={15} />
                    {cityName}
                  </span>
                )}
                <Status value={company.verificationStatus} />
                {company.synthetic && <span className="sample-label">{t('sampleData')}</span>}
              </div>
            </div>
            <div className="org-overview-actions">
              <a className="button button-outline" href="#org-saved-preview">
                {copy.preview}
                <ArrowUpRight size={16} />
              </a>
              {canEdit && !editor && (
                <button className="button button-primary" onClick={() => startEditing()}>
                  <Pencil size={17} />
                  {copy.edit}
                </button>
              )}
            </div>
          </section>
          {saved && (
            <p className="org-save-success" role="status">
              <CheckCircle2 size={20} />
              {copy.saved}
            </p>
          )}
          {!canEdit && (
            <p className="org-profile-notice">
              <ShieldCheck size={19} />
              {company.verificationStatus === 'SUSPENDED' ? copy.suspended : copy.readOnly}
            </p>
          )}
          {query.isError && (
            <div className="org-profile-notice" role="alert">
              <span>{copy.refreshNotice}</span>
              <button className="text-button" onClick={() => void query.refetch()}>
                {copy.refresh}
              </button>
            </div>
          )}
          <div className="org-profile-layout">
            <div className="org-profile-main">
              {editor ? (
                <form
                  onSubmit={submit}
                  className="org-profile-editor"
                  noValidate
                  aria-label={copy.editing}
                >
                  <div className="org-editor-heading">
                    <Pencil size={20} />
                    <div>
                      <h2>{copy.editing}</h2>
                      <p>{copy.editingHint}</p>
                    </div>
                    <span>{dirty ? copy.unsaved : copy.unchanged}</span>
                  </div>
                  <fieldset disabled={save.isPending || !canEdit}>
                    <legend className="sr-only">{copy.identity}</legend>
                    <section className="org-editor-section">
                      <h3>{copy.identity}</h3>
                      <p>{copy.identityHint}</p>
                      <div className="org-form-grid">
                        {field('name', copy.name, copy.nameHint, {
                          required: true,
                          maxLength: 150,
                        })}
                        <div className="org-form-field">
                          <label htmlFor="org-field-cityId">{copy.city}</label>
                          <select
                            id="org-field-cityId"
                            value={editor.draft.cityId}
                            onChange={(event) => change('cityId', event.target.value)}
                            aria-invalid={!!errors.cityId}
                            aria-describedby={errors.cityId ? 'org-error-cityId' : undefined}
                            required
                          >
                            <option value="">{copy.selectCity}</option>
                            {!catalog.data?.cities.some(
                              (city) => city.id === editor.draft.cityId,
                            ) &&
                              editor.draft.cityId && (
                                <option value={editor.draft.cityId}>{cityName || copy.city}</option>
                              )}
                            {catalog.data?.cities.map((city) => (
                              <option key={city.id} value={city.id}>
                                {city[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
                              </option>
                            ))}
                          </select>
                          {errors.cityId && (
                            <p id="org-error-cityId" className="field-error">
                              {errors.cityId}
                            </p>
                          )}
                          {catalog.isError && (
                            <div className="org-field-hint" role="alert">
                              {copy.catalogFailed}
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => void catalog.refetch()}
                              >
                                {t('retry')}
                              </button>
                            </div>
                          )}
                        </div>
                        {field('stir', copy.stir, copy.stirHint, { maxLength: 9 })}
                      </div>
                      <div className="org-review-note">
                        <ShieldCheck size={17} />
                        {copy.identityReview}
                      </div>
                    </section>
                    <section className="org-editor-section">
                      <h3>{copy.contact}</h3>
                      <p>{copy.contactHint}</p>
                      <div className="org-form-grid">
                        {field('contactName', copy.contactName, undefined, {
                          required: true,
                          maxLength: 100,
                        })}
                        {field('contactPhone', copy.contactPhone, copy.phoneHint, {
                          type: 'tel',
                          maxLength: 16,
                        })}
                        {field('website', copy.website, copy.websiteHint, {
                          type: 'url',
                          maxLength: 500,
                        })}
                      </div>
                    </section>
                    <section className="org-editor-section">
                      <h3>{copy.about}</h3>
                      <p>{copy.aboutHint}</p>
                      <div className="org-form-field">
                        <label htmlFor="org-field-description">
                          {copy.description}
                          <span>{copy.optional}</span>
                        </label>
                        <textarea
                          id="org-field-description"
                          rows={7}
                          maxLength={3000}
                          value={editor.draft.description}
                          onChange={(event) => change('description', event.target.value)}
                          placeholder={copy.descriptionPlaceholder}
                          aria-invalid={!!errors.description}
                          aria-describedby={`org-description-count${errors.description ? ' org-error-description' : ''}`}
                        />
                        <span className="org-character-count" id="org-description-count">
                          {editor.draft.description.length.toLocaleString(
                            i18n.language === 'ru' ? 'ru-RU' : 'en-US',
                          )}{' '}
                          / 3 000 {copy.characters}
                        </span>
                        {errors.description && (
                          <p className="field-error" id="org-error-description">
                            {errors.description}
                          </p>
                        )}
                      </div>
                    </section>
                  </fieldset>
                  {Object.values(errors).some(Boolean) && (
                    <p className="org-validation-summary" role="alert">
                      {copy.fixErrors}
                    </p>
                  )}
                  {stale || (save.error instanceof ApiError && save.error.status === 409) ? (
                    <div className="org-conflict" role="alert">
                      <strong>{copy.conflict}</strong>
                      <p>{copy.conflictHint}</p>
                      <button
                        className="button button-outline"
                        type="button"
                        disabled={query.isFetching}
                        onClick={() => void query.refetch()}
                      >
                        <RefreshCw size={16} />
                        {copy.refresh}
                      </button>
                    </div>
                  ) : (
                    save.error && (
                      <div className="org-save-error">
                        <ErrorState error={save.error} />
                      </div>
                    )
                  )}
                  <footer className="org-editor-actions">
                    <span>
                      <Circle size={10} fill={dirty ? 'currentColor' : 'none'} />
                      {dirty ? copy.unsaved : copy.unchanged}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={save.isPending}
                        onClick={() => (dirty ? setDiscardOpen(true) : discard())}
                      >
                        {copy.cancel}
                      </button>
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={!dirty || save.isPending || stale || !canEdit}
                      >
                        <Save size={17} />
                        {save.isPending ? copy.saving : copy.save}
                      </button>
                    </div>
                  </footer>
                </form>
              ) : (
                <>
                  <Section
                    title={copy.identity}
                    hint={copy.identityHint}
                    icon={<Building2 size={22} />}
                    action={editButton('name', copy.identity)}
                  >
                    <dl className="org-detail-grid">
                      <Detail label={copy.name}>{company.name}</Detail>
                      <Detail label={copy.city}>{cityName || copy.empty}</Detail>
                      <Detail label={copy.stir}>
                        {company.stir || <span className="org-unfilled">{copy.empty}</span>}
                      </Detail>
                    </dl>
                  </Section>
                  <Section
                    title={copy.contact}
                    hint={copy.contactHint}
                    icon={<Phone size={22} />}
                    action={editButton('contactName', copy.contact)}
                  >
                    <dl className="org-detail-grid">
                      <Detail label={copy.contactName}>{company.contactName || copy.empty}</Detail>
                      <Detail label={copy.contactPhone}>
                        {company.contactPhone ? (
                          <a href={`tel:${company.contactPhone}`}>{company.contactPhone}</a>
                        ) : (
                          <span className="org-unfilled">{copy.empty}</span>
                        )}
                      </Detail>
                      <Detail label={copy.website}>
                        {company.website && validWebsite(company.website) ? (
                          <a href={company.website} target="_blank" rel="noopener noreferrer">
                            {company.website}
                            <ArrowUpRight size={13} />
                          </a>
                        ) : (
                          <span className="org-unfilled">{copy.empty}</span>
                        )}
                      </Detail>
                    </dl>
                    <p className="org-field-hint">{copy.phoneHint}</p>
                  </Section>
                  <Section
                    title={copy.about}
                    hint={copy.aboutHint}
                    icon={<FileText size={22} />}
                    action={editButton('description', copy.about)}
                  >
                    <p className={company.description ? 'org-description' : 'org-unfilled'}>
                      {company.description || copy.previewEmpty}
                    </p>
                  </Section>
                </>
              )}
              <Section
                title={copy.branches}
                hint={copy.branchesHint}
                icon={<Users size={22} />}
                action={
                  canTeam ? (
                    <Link className="org-edit-section" to="/employer/team">
                      {copy.branchManage}
                      <ArrowRight size={16} />
                    </Link>
                  ) : undefined
                }
              >
                <div className="org-branch-summary">
                  <span>
                    <strong>{branches.length}</strong>
                    {copy.branchCount}
                  </span>
                  {canTeam && (
                    <span>
                      <strong>{activeMembers}</strong>
                      {copy.memberCount}
                    </span>
                  )}
                </div>
                {scoped && <p className="org-field-hint">{copy.branchScope}</p>}
                <div className="org-branch-list">
                  {branches.length ? (
                    branches.map((branch) => (
                      <div key={branch.id}>
                        <span className="org-branch-icon">
                          <MapPin size={18} />
                        </span>
                        <div>
                          <h3>{branch.name}</h3>
                          <p>{branch.area}</p>
                          {branch.address && <small>{branch.address}</small>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="org-unfilled">{copy.noBranches}</p>
                  )}
                </div>
              </Section>
              <Section
                id="org-saved-preview"
                title={copy.previewTitle}
                hint={copy.previewHint}
                icon={<Globe size={22} />}
              >
                <div className="org-preview-card">
                  <div className="org-preview-header">
                    <span className="org-company-avatar" aria-hidden="true">
                      <Building2 size={27} />
                    </span>
                    <div>
                      <h3>{company.name}</h3>
                      <p>{cityName}</p>
                    </div>
                    <Status value={company.verificationStatus} />
                  </div>
                  <p className="org-description">{company.description || copy.previewEmpty}</p>
                  {branches.length > 0 && (
                    <div className="org-preview-areas">
                      <span>{copy.previewArea}</span>
                      {[...new Set(branches.map((branch) => branch.area).filter(Boolean))].map(
                        (area) => (
                          <span key={area} className="org-area-tag">
                            {area}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {company.website && validWebsite(company.website) && (
                    <a
                      className="org-website-link"
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Globe size={16} />
                      {new URL(company.website).hostname}
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
              </Section>
              {canManage && (
                <Section
                  title={copy.documents}
                  hint={copy.documentsHint}
                  icon={<ShieldCheck size={22} />}
                >
                  <button
                    type="button"
                    className="button button-outline"
                    aria-expanded={documentsOpen}
                    aria-controls="org-private-documents"
                    onClick={() => setDocumentsOpen(!documentsOpen)}
                  >
                    {documentsOpen ? copy.documentsClose : copy.documentsOpen}
                    <FileText size={17} />
                  </button>
                  {documentsOpen && (
                    <div id="org-private-documents">
                      <PrivateFiles />
                    </div>
                  )}
                </Section>
              )}
              {canKeys && (
                <section className="org-profile-section org-integrations">
                  <button
                    className="org-disclosure-button"
                    aria-expanded={integrationsOpen}
                    aria-controls="org-api-keys"
                    onClick={() => setIntegrationsOpen(!integrationsOpen)}
                  >
                    <KeyRound size={22} />
                    <span>
                      <strong>{copy.integrations}</strong>
                      <small>{copy.integrationsHint}</small>
                    </span>
                    {integrationsOpen ? <X size={18} /> : <Plus size={18} />}
                  </button>
                  {integrationsOpen && (
                    <div id="org-api-keys">
                      <ApiKeys organizationId={company.id} />
                    </div>
                  )}
                </section>
              )}
            </div>
            <aside className="org-profile-aside">
              <section className="org-side-card">
                <h2>{copy.completeness}</h2>
                <div className="org-completeness-number">
                  <strong>
                    {Math.round((complete / checklist.length) * 100)}
                    <span>%</span>
                  </strong>
                  <span>
                    {complete} / {checklist.length} {copy.completed}
                  </span>
                </div>
                <progress aria-label={copy.completeness} value={complete} max={checklist.length} />
                <ul className="org-checklist">
                  {checklist.map((item) => (
                    <li key={item.label} className={item.done ? 'is-complete' : ''}>
                      {item.done ? (
                        <CheckCircle2 size={17} aria-label={copy.complete} />
                      ) : (
                        <Circle size={17} aria-label={copy.missing} />
                      )}
                      {!item.done && item.field && canEdit && !editor ? (
                        <button onClick={() => startEditing(item.field)}>
                          {item.label}
                          <ArrowRight size={14} />
                        </button>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p>{copy.completenessHint}</p>
              </section>
              <section className="org-side-card">
                <div className="org-side-title">
                  <ShieldCheck size={21} />
                  <h2>{copy.verification}</h2>
                </div>
                <Status value={company.verificationStatus} />
                <p>
                  {company.verificationStatus === 'VERIFIED'
                    ? copy.verifiedText
                    : company.verificationStatus === 'PENDING'
                      ? copy.pendingText
                      : company.verificationStatus === 'REJECTED'
                        ? copy.rejectedText
                        : company.verificationStatus === 'SUSPENDED'
                          ? copy.suspended
                          : copy.unverifiedText}
                </p>
                {canEdit && ['UNVERIFIED', 'REJECTED'].includes(company.verificationStatus) && (
                  <button
                    className="button button-outline"
                    disabled={verify.isPending || !!editor}
                    onClick={() => verify.mutate({})}
                  >
                    {copy.verificationSubmit}
                    <ArrowRight size={16} />
                  </button>
                )}
                <Feedback error={verify.error} />
                {company.verificationStatus === 'SUSPENDED' && (
                  <Link className="text-link" to="/help">
                    {copy.support}
                    <ArrowRight size={15} />
                  </Link>
                )}
              </section>
              <section className="org-side-card">
                <div className="org-side-title">
                  <Wallet size={21} />
                  <h2>{copy.billing}</h2>
                </div>
                {canBilling ? (
                  <QueryState
                    pending={billing.isPending}
                    error={billing.error}
                    retry={() => void billing.refetch()}
                  >
                    {billing.data?.subscription && (
                      <Status
                        value={
                          billing.data.subscription.effectiveStatus ||
                          billing.data.subscription.status
                        }
                      />
                    )}
                    {billing.data?.effectiveEntitlement ? (
                      <>
                        <p>{copy.billingActive}</p>
                        <dl className="org-billing-facts">
                          <Detail label={copy.billingUntil}>
                            {dateTime(billing.data.effectiveEntitlement.endsAt, i18n.language)}
                          </Detail>
                          <Detail label={copy.billingLimit}>
                            {billing.data.effectiveEntitlement.planVersion.publishLimit}
                          </Detail>
                        </dl>
                      </>
                    ) : (
                      <p>{copy.billingNone}</p>
                    )}
                    <Link className="button button-outline" to="/employer/billing">
                      {copy.billingManage}
                      <ArrowRight size={16} />
                    </Link>
                    <p className="org-field-hint">{copy.billingSeparate}</p>
                  </QueryState>
                ) : (
                  <p>{copy.billingReadOnly}</p>
                )}
              </section>
              <section className="org-side-card">
                <h2>{copy.access}</h2>
                <strong className="org-role-name">{roleName}</strong>
                <p>{scoped ? copy.scopeBranches : copy.scopeAll}</p>
                <ul className="org-access-list">
                  {[
                    [copy.manageProfile, canManage],
                    [copy.manageTeam, canTeam],
                    [copy.viewBilling, canBilling],
                  ].map(([label, allowed]) => (
                    <li key={String(label)}>
                      <span>{label}</span>
                      {allowed ? (
                        <Check size={17} aria-label={copy.allowed} />
                      ) : (
                        <span className="org-unfilled">{copy.restricted}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
          <footer className="org-profile-footer">
            <Link to="/help">{copy.support}</Link>
            <Link to="/privacy">{copy.privacy}</Link>
            <Link to="/terms">{copy.terms}</Link>
          </footer>
        </>
      )}
      <Modal title={copy.discardTitle} open={discardOpen} onClose={() => setDiscardOpen(false)}>
        <p>{copy.discardText}</p>
        <div className="org-discard-actions">
          <button className="button button-outline" onClick={() => setDiscardOpen(false)}>
            {copy.keepEditing}
          </button>
          <button className="button button-primary" onClick={discard}>
            {copy.discard}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ApiKeys({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const query = useApi<Page<ApiKey>>(`/organizations/${organizationId}/api-keys`);
  const create = useAction<{ key: string }>(`/organizations/${organizationId}/api-keys`);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [scopes, setScopes] = useState(['shifts:read']);
  return (
    <div className="org-api-layout">
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className="record-list">
          {list(query.data).length ? (
            list(query.data).map((item) => (
              <section className="panel" key={item.id}>
                <div className="record-heading">
                  <h3>{item.name}</h3>
                  <Status value={item.revokedAt ? 'REVOKED' : 'ACTIVE'} />
                </div>
                <code>{item.keyPrefix}…</code>
                <p className="small muted">{dateTime(item.expiresAt, i18n.language)}</p>
                <div className="permission-list">
                  {item.scopes.map((scope) => (
                    <code key={scope}>{scope}</code>
                  ))}
                </div>
                {!item.revokedAt && (
                  <Action
                    path={`/organizations/${organizationId}/api-keys/${item.id}`}
                    method="DELETE"
                    label={t('revoke')}
                  />
                )}
              </section>
            ))
          ) : (
            <Empty />
          )}
        </div>
      </QueryState>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, expiresAt: localToIso(expiry), scopes });
        }}
      >
        <h3>{t('newApiKey')}</h3>
        <label>
          {t('name')}
          <input
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {t('end')}
          <input
            required
            type="datetime-local"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>{t('permissions')}</legend>
          {['shifts:read', 'assignments:read'].map((scope) => (
            <label className="check-label" key={scope}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(event) =>
                  setScopes(
                    event.target.checked
                      ? [...scopes, scope]
                      : scopes.filter((item) => item !== scope),
                  )
                }
              />
              <code>{scope}</code>
            </label>
          ))}
        </fieldset>
        <button className="button button-primary" disabled={!scopes.length || create.isPending}>
          {t('save')}
          <Plus size={17} />
        </button>
        <Feedback error={create.error} success={create.isSuccess} />
        {create.data && (
          <label>
            {t('keyOnce')}
            <textarea readOnly value={create.data.key} />
          </label>
        )}
      </form>
    </div>
  );
}
