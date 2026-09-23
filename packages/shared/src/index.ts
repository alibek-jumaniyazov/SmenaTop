export const TIMEZONE = 'Asia/Tashkent';
export const CURRENCY = 'UZS';
export type Money = { amountMinor: string; currency: 'UZS' };
export type ApiError = {
  code: string;
  message: string;
  fieldErrors: Record<string, string[]>;
  requestId: string;
};
export const ORGANIZATION_PERMISSIONS = [
  'shift.read',
  'shift.create',
  'shift.publish',
  'application.review',
  'attendance.approve',
  'billing.manage',
  'wage.manage',
  'member.invite',
  'branch.manage',
  'organization.manage',
  'api.manage',
  'analytics.read',
] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
export const VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
] as const;
