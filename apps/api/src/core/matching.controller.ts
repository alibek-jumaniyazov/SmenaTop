import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { SessionGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user';
@ApiTags('Deterministic matching')
@UseGuards(SessionGuard)
@Controller('worker')
export class MatchingController {
  constructor(private readonly db: PrismaService) {}
  @Get('matching') async matching(@CurrentUser() user: AuthUser) {
    const profile = await this.db.workerProfile.findUnique({
      where: { userId: user.id },
      include: { skills: true, availability: true },
    });
    if (!profile || profile.verificationStatus !== 'VERIFIED' || !profile.adultConfirmed)
      return { items: [], formulaVersion: 'v1', reason: 'VERIFICATION_REQUIRED' };
    const [shifts, bookings, history] = await Promise.all([
      this.db.shift.findMany({
        where: {
          cityId: profile.cityId,
          categoryId: { in: profile.categoryIds },
          status: 'PUBLISHED',
          startAt: { gt: new Date() },
          applyDeadline: { gt: new Date() },
          organization: { status: 'ACTIVE', verificationStatus: 'VERIFIED' },
        },
        include: {
          organization: {
            select: { id: true, name: true, synthetic: true, verificationStatus: true },
          },
          branch: { select: { id: true, name: true, area: true } },
          category: true,
          city: true,
        },
        orderBy: { startAt: 'asc' },
        take: 200,
      }),
      this.db.activeBooking.findMany({ where: { workerId: user.id } }),
      this.db.assignment.groupBy({
        by: ['status'],
        where: { workerId: user.id, status: { in: ['COMPLETED', 'NO_SHOW'] } },
        _count: { _all: true },
      }),
    ]);
    const complete = history.find((h) => h.status === 'COMPLETED')?._count._all ?? 0;
    const noShow = history.find((h) => h.status === 'NO_SHOW')?._count._all ?? 0;
    const skillSet = new Set(
      profile.skills.filter((s) => s.status === 'VERIFIED').map((s) => s.skillId),
    );
    const items = shifts
      .filter(
        (s) =>
          s.requiredSkillIds.every((id) => skillSet.has(id)) &&
          !bookings.some((b) => b.startAt < s.endAt && b.endAt > s.startAt),
      )
      .map((shift) => {
        const available = profile.availability.some(
          (a) => a.startAt <= shift.startAt && a.endAt >= shift.endAt,
        );
        const historyScore =
          complete + noShow === 0 ? 15 : Math.round((20 * complete) / (complete + noShow));
        const score = 30 + (available ? 40 : 10) + historyScore + Math.min(10, complete * 2);
        return {
          ...shift,
          matching: {
            score,
            formulaVersion: 'v1',
            reasons: [
              available ? 'DECLARED_AVAILABILITY' : 'ELIGIBLE_WITHOUT_AVAILABILITY',
              'VERIFIED_REQUIRED_SKILLS',
              complete + noShow === 0 ? 'NEW_WORKER_NEUTRAL_PRIOR' : 'COMPLETED_ATTENDANCE_HISTORY',
            ],
            signals: {
              availability: available ? 40 : 10,
              skills: 30,
              attendance: historyScore,
              experience: Math.min(10, complete * 2),
            },
            usesProtectedCharacteristics: false,
          },
        };
      })
      .sort(
        (a, b) => b.matching.score - a.matching.score || a.startAt.getTime() - b.startAt.getTime(),
      );
    return {
      items,
      formulaVersion: 'v1',
      total: items.length,
      explanation:
        'City, category, verification and overlap are hard filters. Availability 10–40, verified skill eligibility 30, attendance 0–20 (new workers 15), completed-shift experience 0–10. No protected attributes or location tracking.',
    };
  }
}
