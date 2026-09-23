import type { OpenAPIObject } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  orgSchema,
  profileSchema,
  availabilitySchema,
  organizationPatchSchema,
} from '../core/profile.service';
import { shiftSchema, shiftPatchSchema } from '../core/shifts.service';

const string: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const integer: SchemaObject = { type: 'integer' };
const boolean: SchemaObject = { type: 'boolean' };
const money: SchemaObject = {
  type: 'string',
  pattern: '^[0-9]+$',
  description: 'UZS tiyin (1 UZS = 100 tiyin), serialized as an integer decimal string.',
};
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const ref = (name: string): SchemaObject =>
  ({ $ref: `#/components/schemas/${name}` }) as SchemaObject;
const list = (name: string): SchemaObject =>
  object({ items: array(ref(name)), total: integer, page: integer, pageSize: integer }, ['items']);
const catalog = object(
  { id: uuid, code: string, nameUz: string, nameRu: string, active: boolean },
  ['id', 'code', 'nameUz', 'nameRu'],
);

/** Explicit transport schemas: Prisma BigInt/Date and private fields never leak into the client contract. */
export function documentContracts(document: OpenAPIObject) {
  const schemas = document.components?.schemas ?? {};
  schemas.CatalogEntry = catalog;
  schemas.PublicOrganization = object({
    id: uuid,
    name: string,
    verificationStatus: {
      type: 'string',
      enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'],
    },
    synthetic: boolean,
  });
  schemas.OrganizationProfile = object({
    id: uuid,
    name: string,
    contactName: string,
    stir: { ...string, nullable: true },
    description: { ...string, nullable: true, maxLength: 3000 },
    website: { ...string, nullable: true, format: 'uri', maxLength: 500 },
    contactPhone: { ...string, nullable: true, pattern: '^\\+[1-9][0-9]{7,14}$' },
    cityId: uuid,
    verificationStatus: string,
    status: string,
    version: { ...integer, minimum: 1 },
    synthetic: boolean,
    isDemo: boolean,
    createdAt: date,
    branches: array(
      object({
        id: uuid,
        organizationId: uuid,
        cityId: uuid,
        name: string,
        address: string,
        area: string,
        active: boolean,
      }),
    ),
    memberships: array(
      object({
        id: uuid,
        organizationId: uuid,
        userId: uuid,
        role: string,
        customRoleId: { ...uuid, nullable: true },
        branchIds: array(uuid),
        status: string,
        createdAt: date,
        user: object({ id: uuid, name: string }),
      }),
    ),
    roles: array(
      object({ id: uuid, organizationId: uuid, name: string, permissions: array(string) }),
    ),
  });
  schemas.CandidateProfile = object({
    cityId: uuid,
    categoryIds: array(uuid),
    verificationStatus: string,
    experience: string,
    languages: array(string),
    skills: array(
      object({
        id: uuid,
        skillId: uuid,
        status: string,
        verifiedAt: { ...date, nullable: true },
        skill: ref('CatalogEntry'),
      }),
    ),
  });
  schemas.WorkerProfile = object(
    {
      id: uuid,
      userId: uuid,
      cityId: uuid,
      categoryIds: array(uuid),
      languages: array(string),
      experience: string,
      verificationStatus: string,
      adultConfirmed: boolean,
      skills: array(
        object(
          {
            id: uuid,
            skillId: uuid,
            status: string,
            verifiedAt: { ...date, nullable: true },
            skill: ref('CatalogEntry'),
          },
          ['id', 'skillId', 'status'],
        ),
      ),
      availability: array(object({ id: uuid, startAt: date, endAt: date })),
    },
    [
      'id',
      'userId',
      'cityId',
      'categoryIds',
      'languages',
      'experience',
      'verificationStatus',
      'adultConfirmed',
    ],
  );
  schemas.SessionIdentity = object({
    user: object({ id: uuid, phone: string, name: string, platformPermissions: array(string) }),
    workerProfile: { ...ref('WorkerProfile'), nullable: true },
    memberships: array(
      object({
        id: uuid,
        organizationId: uuid,
        userId: uuid,
        role: string,
        branchIds: array(uuid),
        permissions: array(string),
        organization: ref('PublicOrganization'),
      }),
    ),
    csrfToken: string,
  });
  schemas.Shift = object(
    {
      id: uuid,
      organizationId: uuid,
      branchId: uuid,
      categoryId: uuid,
      cityId: uuid,
      title: string,
      description: string,
      duties: array(string),
      requirements: array(string),
      requiredSkillIds: array(uuid),
      startAt: date,
      endAt: date,
      timezone: string,
      breakMinutes: integer,
      paidBreak: boolean,
      headcount: integer,
      amountMinor: money,
      currency: { type: 'string', enum: ['UZS'] },
      payType: { type: 'string', enum: ['HOURLY', 'FIXED'] },
      clothing: string,
      mealProvided: boolean,
      transportProvided: boolean,
      applyDeadline: date,
      status: {
        type: 'string',
        enum: ['DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'],
      },
      version: integer,
      filledCount: integer,
      staffingStatus: { type: 'string', enum: ['OPEN', 'PARTIALLY_FILLED', 'FILLED'] },
      organization: ref('PublicOrganization'),
      branch: object({ id: uuid, name: string, area: string }),
      city: ref('CatalogEntry'),
      category: ref('CatalogEntry'),
    },
    [
      'id',
      'organizationId',
      'branchId',
      'cityId',
      'categoryId',
      'title',
      'description',
      'startAt',
      'endAt',
      'amountMinor',
      'currency',
      'payType',
      'headcount',
      'breakMinutes',
      'paidBreak',
      'requirements',
      'status',
      'version',
    ],
  );
  schemas.Offer = object({
    id: uuid,
    organizationId: uuid,
    applicationId: uuid,
    shiftId: uuid,
    workerId: uuid,
    status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] },
    expiresAt: date,
    createdAt: date,
  });
  schemas.Application = object(
    {
      id: uuid,
      organizationId: uuid,
      shiftId: uuid,
      workerId: uuid,
      status: {
        type: 'string',
        enum: [
          'SUBMITTED',
          'SHORTLISTED',
          'OFFERED',
          'ACCEPTED',
          'REJECTED',
          'WITHDRAWN',
          'EXPIRED',
        ],
      },
      note: string,
      createdAt: date,
      shift: ref('Shift'),
      offers: array(ref('Offer')),
      worker: object({
        id: uuid,
        name: string,
        workerProfile: { ...ref('CandidateProfile'), nullable: true },
      }),
    },
    ['id', 'organizationId', 'shiftId', 'workerId', 'status', 'note', 'createdAt'],
  );
  schemas.Assignment = object(
    {
      id: uuid,
      organizationId: uuid,
      shiftId: uuid,
      workerId: uuid,
      offerId: uuid,
      status: {
        type: 'string',
        enum: [
          'CONFIRMED',
          'CHECKED_IN',
          'CHECKED_OUT',
          'COMPLETED',
          'CANCELLED_BY_WORKER',
          'CANCELLED_BY_EMPLOYER',
          'NO_SHOW',
        ],
      },
      startAt: date,
      endAt: date,
      version: integer,
      shift: ref('Shift'),
      cancelledAt: { ...date, nullable: true },
      cancellationReason: { ...string, nullable: true },
    },
    [
      'id',
      'organizationId',
      'shiftId',
      'workerId',
      'offerId',
      'status',
      'startAt',
      'endAt',
      'version',
    ],
  );
  schemas.ApiError = object({
    code: string,
    message: string,
    fieldErrors: { type: 'object', additionalProperties: { type: 'array', items: string } },
    requestId: string,
  });
  document.components = { ...document.components, schemas };
  const response = (
    path: string,
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    schema: SchemaObject,
    status = method === 'post' ? 201 : 200,
  ) => {
    const operation = document.paths[`/api/v1${path}`]?.[method];
    if (operation)
      operation.responses[status] = {
        description: 'Successful persisted response',
        content: { 'application/json': { schema } },
      };
  };
  const body = (path: string, method: 'post' | 'put' | 'patch', schema: z.ZodType) => {
    const operation = document.paths[`/api/v1${path}`]?.[method];
    if (operation) {
      const raw = z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0' });
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: raw as SchemaObject } },
      };
    }
  };
  response(
    '/catalog',
    'get',
    object({
      cities: array(ref('CatalogEntry')),
      categories: array(ref('CatalogEntry')),
      skills: array(ref('CatalogEntry')),
    }),
  );
  response('/auth/otp/request', 'post', object({ challengeId: uuid, expiresAt: date }));
  response('/auth/otp/verify', 'post', ref('SessionIdentity'));
  response('/auth/me', 'get', ref('SessionIdentity'));
  response('/shifts', 'get', list('Shift'));
  response('/shifts/{id}', 'get', ref('Shift'));
  response('/worker/profile', 'get', { ...ref('WorkerProfile'), nullable: true });
  response('/worker/profile', 'put', ref('WorkerProfile'));
  body('/worker/profile', 'put', profileSchema);
  body('/organizations', 'post', orgSchema);
  response('/organizations/{org}', 'get', ref('OrganizationProfile'));
  response('/organizations/{org}', 'patch', ref('OrganizationProfile'));
  body('/organizations/{org}', 'patch', organizationPatchSchema);
  const organizationPatch = document.paths['/api/v1/organizations/{org}']?.patch;
  if (organizationPatch)
    organizationPatch.description =
      'Requires organization.manage. Supply the current version; stale edits return 409 VERSION_CONFLICT. Omitted fields are preserved; null clears optional fields. Name, STIR or city changes reopen verification and supersede older pending requests. Suspended organizations cannot edit their profile.';
  body('/worker/availability', 'post', availabilitySchema);
  response('/worker/applications', 'get', list('Application'));
  response('/worker/assignments', 'get', list('Assignment'));
  response('/worker/favorites', 'get', list('Shift'));
  response('/organizations/{org}/shifts', 'get', list('Shift'));
  response('/organizations/{org}/shifts', 'post', ref('Shift'));
  body('/organizations/{org}/shifts', 'post', shiftSchema);
  body('/organizations/{org}/shifts/{id}', 'patch', shiftPatchSchema);
  response('/organizations/{org}/shifts/{id}', 'patch', ref('Shift'));
  response('/organizations/{org}/shifts/{id}', 'get', ref('Shift'));
  response('/organizations/{org}/shifts/{id}/publish', 'post', ref('Shift'));
  response('/organizations/{org}/shifts/{id}/cancel', 'post', ref('Shift'));
  response('/organizations/{org}/applications', 'get', list('Application'));
  response('/organizations/{org}/assignments', 'get', list('Assignment'));
  response('/shifts/{id}/applications', 'post', ref('Application'));
  response('/applications/{id}/offer', 'post', ref('Offer'));
  response('/offers/{id}/accept', 'post', ref('Assignment'));
  response('/assignments/{id}/cancel', 'post', ref('Assignment'));
  for (const [path, item] of Object.entries(document.paths))
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      for (const status of [401, 403, 404, 409, 422, 429, 500])
        operation.responses[status] ??= {
          description: `HTTP ${status}`,
          content: { 'application/json': { schema: ref('ApiError') } },
        };
      if (
        !path.includes('/auth/otp') &&
        !path.includes('/health') &&
        !path.includes('/payments/') &&
        path !== '/api/v1/catalog' &&
        !(path.startsWith('/api/v1/shifts') && method === 'get')
      )
        operation.security ??= [{ cookie: [] }];
      if (!['get'].includes(method) && !path.includes('/auth/otp') && !path.includes('/payments/'))
        operation.parameters = [
          ...(operation.parameters ?? []),
          { name: 'x-csrf-token', in: 'header', required: true, schema: string },
        ];
    }
}
