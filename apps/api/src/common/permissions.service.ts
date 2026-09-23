import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user';

export const ORG_PERMISSIONS = [
  'shift.read',
  'shift.create',
  'shift.publish',
  'application.review',
  'attendance.approve',
  'billing.read',
  'billing.manage',
  'wage.read',
  'wage.manage',
  'member.invite',
  'branch.manage',
  'organization.manage',
  'api.manage',
  'analytics.read',
];
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ORG_PERMISSIONS,
  ADMIN: ORG_PERMISSIONS.filter(
    (p) => !['billing.manage', 'wage.manage', 'api.manage'].includes(p),
  ),
  MANAGER: [
    'shift.read',
    'shift.create',
    'shift.publish',
    'application.review',
    'attendance.approve',
    'wage.read',
    'analytics.read',
  ],
  FINANCE: ['billing.read', 'billing.manage', 'wage.read', 'wage.manage'],
};
@Injectable()
export class PermissionsService {
  constructor(private readonly db: PrismaService) {}
  async permissions(userId: string, organizationId: string) {
    const member = await this.db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: true },
    });
    if (!member || member.status !== 'ACTIVE' || member.organization.status !== 'ACTIVE')
      throw new ForbiddenException('Tashkilotga kirish taqiqlangan');
    const custom = member.customRoleId
      ? await this.db.organizationRole.findFirst({
          where: { id: member.customRoleId, organizationId },
        })
      : null;
    return { member, permissions: custom?.permissions ?? ROLE_PERMISSIONS[member.role] ?? [] };
  }
  async requireOrg(userId: string, organizationId: string, permission: string, branchId?: string) {
    const { member, permissions } = await this.permissions(userId, organizationId);
    if (!permissions.includes(permission))
      throw new ForbiddenException('Bu amal uchun ruxsat yo‘q');
    if (member.role === 'MANAGER' || member.branchIds.length) {
      if (!branchId || !member.branchIds.includes(branchId))
        throw new ForbiddenException('Filial doirasi tashqarisida');
    }
    return member;
  }
  requirePlatform(user: AuthUser, permission: string) {
    if (!user.platformPermissions.includes(permission))
      throw new ForbiddenException('Platforma ruxsati talab qilinadi');
  }
}
