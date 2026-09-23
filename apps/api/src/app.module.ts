import { Controller, Get, Global, Module, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from './prisma/prisma.service';
import { PermissionsService } from './common/permissions.service';
import { SessionGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthController, LocalInboxController } from './auth/auth.controller';
import { ProfileService } from './core/profile.service';
import { ShiftsService } from './core/shifts.service';
import { CoreController, PublicController } from './core/core.controller';
import {
  ApiKeysService,
  IntegrationController,
  ManagementController,
} from './core/management.controller';
import { OperationsModule } from './operations/operations.module';
import { BillingModule } from './billing/billing.module';
import { FilesModule } from './files/files.module';
import { MfaModule } from './mfa/mfa.module';
import { TeamController } from './core/team.controller';
import { MatchingController } from './core/matching.controller';
@Global()
@Module({
  providers: [PrismaService, PermissionsService, SessionGuard],
  exports: [PrismaService, PermissionsService, SessionGuard],
})
export class InfrastructureModule {}
@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Get() health() {
    return {
      status: 'ok',
      environment: process.env.APP_ENV,
      version: '0.1.0',
      sms: process.env.SMS_PROVIDER === 'local' ? 'LOCAL_MOCK' : 'NOT_CONFIGURED',
    };
  }
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    const redis = new Redis(process.env.REDIS_URL ?? '', {
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, redis.connect().then(() => redis.ping())]);
      return { status: 'ready', database: 'up', redis: 'up' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    } finally {
      redis.disconnect();
    }
  }
}
@Module({
  imports: [InfrastructureModule, OperationsModule, BillingModule, FilesModule, MfaModule],
  controllers: [
    AuthController,
    PublicController,
    CoreController,
    ManagementController,
    IntegrationController,
    HealthController,
    TeamController,
    MatchingController,
    ...(process.env.APP_ENV !== 'production' && process.env.NODE_ENV !== 'production'
      ? [LocalInboxController]
      : []),
  ],
  providers: [AuthService, ProfileService, ShiftsService, ApiKeysService],
})
export class AppModule {}
