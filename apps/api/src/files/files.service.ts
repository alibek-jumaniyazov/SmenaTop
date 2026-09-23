import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { StorageService } from './storage.service';

export interface UploadedDocument {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
export function detectDocument(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  return undefined;
}

@Injectable()
export class FilesService {
  private readonly signingKey = process.env.FILE_SIGNING_SECRET ?? randomBytes(32).toString('hex');
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly storage: StorageService,
  ) {}
  async upload(user: AuthUser, file: UploadedDocument | undefined) {
    if (!file || file.size === 0 || file.size > 5 * 1024 * 1024)
      throw new BadRequestException('PDF, PNG yoki JPEG fayl (5 MB gacha) talab qilinadi');
    const mimeType = detectDocument(file.buffer);
    if (!mimeType || !allowed.has(file.mimetype) || mimeType !== file.mimetype)
      throw new BadRequestException('Fayl tarkibi va turi mos emas');
    const recent = await this.db.fileAsset.count({
      where: { ownerId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (recent >= 20) throw new BadRequestException('Soatlik fayl yuklash chegarasi');
    const storageKey = randomUUID();
    const status = await this.storage.scan(file.buffer);
    await this.storage.put(storageKey, file.buffer, mimeType);
    try {
      const result = await this.db.$transaction(async (tx) => {
        const asset = await tx.fileAsset.create({
          data: {
            ownerId: user.id,
            storageKey,
            mimeType,
            sizeBytes: file.size,
            originalName: file.originalname.replace(/[^\p{L}\p{N}. _-]/gu, '_').slice(0, 150),
            status,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          },
        });
        await tx.privateDocument.create({
          data: { fileId: asset.id, userId: user.id, purpose: 'VERIFICATION' },
        });
        return asset;
      });
      return {
        id: result.id,
        status: result.status,
        originalName: result.originalName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      };
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }
  list(user: AuthUser) {
    return this.db.fileAsset.findMany({
      where: { ownerId: user.id },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async authorize(user: AuthUser, id: string) {
    const file = await this.db.fileAsset.findUnique({ where: { id } });
    if (!file) throw new NotFoundException();
    if (file.ownerId !== user.id) {
      const document = await this.db.privateDocument.findUnique({ where: { fileId: id } });
      this.permissions.requirePlatform(
        user,
        document?.purpose === 'BANK_EVIDENCE' ? 'billing.reconcile' : 'verification.document.read',
      );
      await this.db.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: file.organizationId,
          action: 'private-document.access',
          resourceId: file.id,
          metadata: {},
        },
      });
    }
    return file;
  }
  private sign(id: string, userId: string, expires: string) {
    return createHmac('sha256', this.signingKey).update(`${id}:${userId}:${expires}`).digest('hex');
  }
  async download(user: AuthUser, id: string) {
    const file = await this.authorize(user, id);
    if (file.status !== 'CLEAN') throw new ForbiddenException('Fayl karantinda yoki rad etilgan');
    const expires = String(Date.now() + 60_000);
    return {
      url: `/api/v1/files/${id}/content?expires=${expires}&signature=${this.sign(id, user.id, expires)}`,
      expiresAt: new Date(Number(expires)),
    };
  }
  async content(user: AuthUser, id: string, expires: string, signature: string) {
    if (
      !/^\d{13}$/.test(expires ?? '') ||
      !/^[a-f0-9]{64}$/.test(signature ?? '') ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 60_000 ||
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(this.sign(id, user.id, expires), 'hex'),
      )
    )
      throw new ForbiddenException('Havola eskirgan yoki yaroqsiz');
    const file = await this.authorize(user, id);
    if (file.status !== 'CLEAN') throw new ForbiddenException('Faylga kirish yopiq');
    return { file, buffer: await this.storage.get(file.storageKey) };
  }
  async reviewLocal(user: AuthUser, id: string, status: 'CLEAN' | 'REJECTED', reason: string) {
    if (process.env.APP_ENV === 'production') throw new NotFoundException();
    this.permissions.requirePlatform(user, 'verification.document.read');
    return this.db.$transaction(async (tx) => {
      const file = await tx.fileAsset.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'private-document.local-review',
          resourceId: id,
          reason,
          metadata: { status, adapter: 'LOCAL_MANUAL_REVIEW' },
        },
      });
      return { id: file.id, status: file.status };
    });
  }
}
