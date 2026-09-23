import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/current-user';
import { BillingService } from './billing.service';
import {
  BankConfirmDto,
  BankEvidenceDto,
  CancelSubscriptionDto,
  CheckoutDto,
  PlanVersionDto,
  RefundDto,
  SimulateDto,
} from './billing.dto';
import { PaymeService } from './payme.service';

@ApiTags('Billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('billing/plans') plans() {
    return this.billing.plans();
  }
  @Get('billing/providers') providers() {
    return this.billing.providers();
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Get('organizations/:id/billing') overview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billing.overview(user, id);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('organizations/:id/billing/checkout') checkout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CheckoutDto,
  ) {
    return this.billing.checkout(user, id, input);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('organizations/:id/billing/cancel') cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancelSubscriptionDto,
  ) {
    return this.billing.cancelSubscription(user, id, input.cancelAtPeriodEnd);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Get('admin/billing') finance(
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.financeQueue(user);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('admin/payments/:id/refund') refund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RefundDto,
  ) {
    return this.billing.refund(user, id, input.reason);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('payments/:id/bank-evidence') bankEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: BankEvidenceDto,
  ) {
    return this.billing.submitBankEvidence(user, id, input);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('admin/payments/:id/bank-confirm') bankConfirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: BankConfirmDto,
  ) {
    return this.billing.confirmBank(user, id, input);
  }
  @ApiCookieAuth() @UseGuards(SessionGuard) @Post('admin/plans/:id/versions') planVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PlanVersionDto,
  ) {
    return this.billing.createPlanVersion(user, id, input);
  }
}

@ApiTags('Local provider simulator')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('developer/payments')
export class LocalPaymentSimulatorController {
  constructor(private readonly billing: BillingService) {}
  @Post(':id/simulate') simulate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SimulateDto,
  ) {
    return this.billing.simulate(user, id, input.scenario);
  }
}

@ApiTags('Payme Merchant API')
@Controller('payments/payme')
export class PaymeController {
  constructor(private readonly payme: PaymeService) {}
  @HttpCode(200) @Post() rpc(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.payme.rpc(authorization, body);
  }
}
