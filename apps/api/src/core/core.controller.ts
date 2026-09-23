import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user';
import { SessionGuard } from '../auth/auth.guard';
import { parse, reason, uuid, iso } from '../common/validation';
import {
  ProfileService,
  profileSchema,
  orgSchema,
  availabilitySchema,
  organizationPatchSchema,
} from './profile.service';
import { ShiftsService, shiftSchema, shiftPatchSchema } from './shifts.service';
@ApiTags('Catalog and shifts')
@Controller()
export class PublicController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly shifts: ShiftsService,
  ) {}
  @Get('catalog') @ApiOperation({ operationId: 'getCatalog' }) catalog() {
    return this.profiles.catalog();
  }
  @Get('shifts') @ApiOperation({ operationId: 'searchShifts' }) search(@Query() query: unknown) {
    return this.shifts.search(
      parse(
        z.object({
          cityId: uuid.optional(),
          categoryId: uuid.optional(),
          q: z.string().max(100).optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
          sort: z.enum(['start', 'pay']).optional(),
        }),
        query,
      ),
    );
  }
  @Get('shifts/:id') @ApiOperation({ operationId: 'getShift' }) detail(@Param('id') id: string) {
    return this.shifts.detail(parse(uuid, id));
  }
}
@ApiTags('Worker and employer')
@UseGuards(SessionGuard)
@Controller()
export class CoreController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly shifts: ShiftsService,
  ) {}
  @Get('worker/profile') profile(@CurrentUser() user: AuthUser) {
    return this.profiles.profile(user);
  }
  @Put('worker/profile') saveProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.profiles.saveProfile(user, parse(profileSchema, body));
  }
  @Post('worker/availability') availability(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.profiles.availability(user, parse(availabilitySchema, body));
  }
  @Delete('worker/availability/:id') removeAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.profiles.deleteAvailability(user, parse(uuid, id));
  }
  @Post('organizations') createOrg(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.profiles.createOrganization(user, parse(orgSchema, body));
  }
  @Get('organizations/:org') organization(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    return this.profiles.organization(user, parse(uuid, org));
  }
  @Patch('organizations/:org')
  @ApiOperation({ operationId: 'updateOrganizationProfile' })
  updateOrganization(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    return this.profiles.updateOrganization(
      user,
      parse(uuid, org),
      parse(organizationPatchSchema, body),
    );
  }
  @Post('organizations/:org/branches') branch(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    return this.profiles.addBranch(
      user,
      parse(uuid, org),
      parse(
        z
          .object({
            cityId: uuid,
            name: z.string().min(2).max(100),
            address: z.string().min(3).max(300),
            area: z.string().min(2).max(100),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('organizations/:org/invitations') invite(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    return this.profiles.invite(
      user,
      parse(uuid, org),
      parse(
        z
          .object({
            phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
            role: z.enum(['ADMIN', 'MANAGER', 'FINANCE']),
            branchIds: z.array(uuid).max(20).default([]),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('invitations/accept') acceptInvite(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.profiles.acceptInvite(
      user,
      parse(z.object({ token: z.string().min(32).max(100) }).strict(), body).token,
    );
  }
  @Post('organizations/:org/roles') customRole(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    return this.profiles.customRole(
      user,
      parse(uuid, org),
      parse(
        z
          .object({ name: z.string().min(2).max(100), permissions: z.array(z.string()).max(20) })
          .strict(),
        body,
      ),
    );
  }
  @Get('organizations/:org/shifts') employerShifts(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    return this.shifts.organizationShifts(user, parse(uuid, org));
  }
  @Post('organizations/:org/shifts') createShift(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    return this.shifts.create(user, parse(uuid, org), parse(shiftSchema, body));
  }
  @Patch('organizations/:org/shifts/:id') patchShift(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shifts.patch(
      user,
      parse(uuid, org),
      parse(uuid, id),
      parse(shiftPatchSchema, body),
    );
  }
  @Post('organizations/:org/shifts/:id/publish') publish(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
  ) {
    return this.shifts.publish(user, parse(uuid, org), parse(uuid, id));
  }
  @Post('organizations/:org/shifts/:id/cancel') cancelShift(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shifts.cancelShift(
      user,
      parse(uuid, org),
      parse(uuid, id),
      parse(reason, body).reason,
    );
  }
  @Post(['shifts/:id/applications', 'shifts/:id/apply']) apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shifts.apply(
      user,
      parse(uuid, id),
      parse(z.object({ note: z.string().max(2000).default('') }).strict(), body ?? {}).note,
    );
  }
  @Get('worker/applications') applications(@CurrentUser() user: AuthUser) {
    return this.shifts.workerApplications(user);
  }
  @Get('organizations/:org/applications') employerApplications(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    return this.shifts.organizationApplications(user, parse(uuid, org));
  }
  @Post('applications/:id/offer') offer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shifts.offer(
      user,
      parse(uuid, id),
      parse(z.object({ expiresAt: iso }).strict(), body).expiresAt,
    );
  }
  @Post('applications/:id/withdraw') withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.shifts.withdraw(user, parse(uuid, id));
  }
  @Post('applications/:id/reject') reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shifts.reject(user, parse(uuid, id));
  }
  @Post('offers/:id/accept') accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.shifts.accept(user, parse(uuid, id), key);
  }
  @Post('offers/:id/revoke') revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shifts.revoke(user, parse(uuid, id));
  }
  @Get('worker/assignments') assignments(@CurrentUser() user: AuthUser) {
    return this.shifts.assignments(user);
  }
  @Get('organizations/:org/assignments') employerAssignments(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    return this.shifts.assignments(user, parse(uuid, org));
  }
  @Post('assignments/:id/cancel') cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shifts.cancelAssignment(user, parse(uuid, id), parse(reason, body).reason);
  }
  @Get('worker/favorites') favorites(@CurrentUser() user: AuthUser) {
    return this.shifts.favorites(user);
  }
  @Post('worker/favorites/:id') favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shifts.save(user, parse(uuid, id));
  }
  @Delete('worker/favorites/:id') unfavorite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.shifts.save(user, parse(uuid, id), true);
  }
}
