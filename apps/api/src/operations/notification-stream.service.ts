import { ForbiddenException, Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';

/** Database-backed personal stream. Reconnection resumes after a durable notification ID. */
@Injectable()
export class NotificationStreamService {
  constructor(private readonly db: PrismaService) {}

  async stream(user: AuthUser, lastEventId?: string): Promise<Observable<MessageEvent>> {
    const previous = lastEventId
      ? await this.db.notification.findFirst({ where: { id: lastEventId, userId: user.id } })
      : null;
    if (lastEventId && !previous) throw new ForbiddenException('Notification cursor mos emas');
    return new Observable<MessageEvent>((subscriber) => {
      let cursor = previous;
      let running = false;
      let closed = false;
      const tick = async () => {
        if (running || closed) return;
        running = true;
        try {
          const session = await this.db.session.findFirst({
            where: {
              id: user.sessionId,
              userId: user.id,
              revokedAt: null,
              expiresAt: { gt: new Date() },
              user: { status: 'ACTIVE' },
            },
          });
          if (!session) {
            subscriber.complete();
            return;
          }
          const items = await this.db.notification.findMany({
            where: {
              userId: user.id,
              ...(cursor
                ? {
                    OR: [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ],
                  }
                : { readAt: null }),
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 100,
          });
          for (const item of items) {
            cursor = item;
            subscriber.next({ id: item.id, type: 'notification', data: item });
          }
          if (!items.length)
            subscriber.next({ type: 'heartbeat', data: { time: new Date().toISOString() } });
        } catch (error) {
          subscriber.error(error);
        } finally {
          running = false;
        }
      };
      void tick();
      const timer = setInterval(() => {
        void tick();
      }, 5000);
      return () => {
        closed = true;
        clearInterval(timer);
      };
    });
  }
}
