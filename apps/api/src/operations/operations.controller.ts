import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/current-user';
import {
  AttendanceDto,
  AttendanceTokenDto,
  CorrectionDto,
  DisputeDto,
  ReasonDto,
  ResolutionDto,
  ReviewDto,
  SupportDto,
  TextMessageDto,
  VerificationReviewDto,
} from './operations.dto';
import { OperationsService } from './operations.service';
import { NotificationStreamService } from './notification-stream.service';

@ApiTags('Operations')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller()
export class OperationsController {
  constructor(
    private readonly service: OperationsService,
    private readonly streams: NotificationStreamService,
  ) {}
  @Post('organizations/:org/shifts/:id/close')
  closeShift(
    @CurrentUser() user: AuthUser,
    @Param('org', ParseUUIDPipe) org: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.closeShift(user, org, id, input.reason);
  }
  @Sse('notifications/stream')
  stream(@CurrentUser() user: AuthUser, @Headers('last-event-id') lastEventId?: string) {
    return this.streams.stream(
      user,
      lastEventId && /^[a-f0-9-]{36}$/i.test(lastEventId) ? lastEventId : undefined,
    );
  }
  @Post('organizations/:org/shifts/:id/early-close')
  earlyClose(
    @CurrentUser() user: AuthUser,
    @Param('org', ParseUUIDPipe) org: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.earlyCloseShift(user, org, id, input.reason);
  }
  @Get('assignments/:id/attendance') attendance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.attendance(user, id);
  }
  @Post('assignments/:id/attendance-token') token(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AttendanceTokenDto,
  ) {
    return this.service.issueToken(user, id, input.kind);
  }
  @Post('assignments/:id/attendance') record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AttendanceDto,
  ) {
    return this.service.recordAttendance(user, id, input);
  }
  @Post('assignments/:id/timesheet/approve') approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.approveTimesheet(user, id);
  }
  @Post('assignments/:id/timesheet/correct') correct(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CorrectionDto,
  ) {
    return this.service.correctTimesheet(user, id, input);
  }
  @Post('assignments/:id/wage/mark-paid') markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.wageAction(user, id, 'mark-paid', input.reason);
  }
  @Post('assignments/:id/wage/confirm') confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.wageAction(user, id, 'confirm');
  }
  @Get('worker/wages') wages(@CurrentUser() user: AuthUser) {
    return this.service.wages(user);
  }
  @Get('organizations/:id/wages') orgWages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.wages(user, id);
  }
  @Post('assignments/:id/disputes') dispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DisputeDto,
  ) {
    return this.service.dispute(user, id, input);
  }
  @Get('assignments/:id/disputes') disputes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.assignmentDisputes(user, id);
  }
  @Post('assignments/:id/no-show') noShow(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.noShow(user, id, input.reason);
  }
  @Post('assignments/:id/reviews') review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewDto,
  ) {
    return this.service.review(user, id, input);
  }
  @Post('reviews/:id/report') reportReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.reportReview(user, id, input.reason);
  }
  @Post('messages/:id/report') reportMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.reportMessage(user, id, input.reason);
  }
  @Get('assignments/:id/messages') messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.messages(user, id);
  }
  @Post('assignments/:id/messages') sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TextMessageDto,
  ) {
    return this.service.sendMessage(user, id, input.text);
  }
  @Get('notifications') notifications(@CurrentUser() user: AuthUser) {
    return this.service.notifications(user);
  }
  @Post('notifications/:id/read') readNotification(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.readNotification(user, id);
  }
  @Get('support') support(@CurrentUser() user: AuthUser) {
    return this.service.support(user);
  }
  @Post('support') createSupport(@CurrentUser() user: AuthUser, @Body() input: SupportDto) {
    return this.service.createSupport(user, input);
  }
  @Get('admin/queue') queue(@CurrentUser() user: AuthUser) {
    return this.service.adminQueue(user);
  }
  @Post('admin/verification/:id') verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VerificationReviewDto,
  ) {
    return this.service.verify(user, id, input);
  }
  @Get('admin/worker-skills') pendingSkills(@CurrentUser() user: AuthUser) {
    return this.service.pendingSkills(user);
  }
  @Post('admin/worker-skills/:id/verify') verifySkill(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VerificationReviewDto,
  ) {
    return this.service.verifySkill(user, id, input);
  }
  @Post('admin/disputes/:id/resolve') resolveDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResolutionDto,
  ) {
    return this.service.resolveDispute(user, id, input.resolution);
  }
  @Post('admin/support/:id/resolve') resolveSupport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResolutionDto,
  ) {
    return this.service.resolveSupport(user, id, input.resolution);
  }
}
