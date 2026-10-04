import { Module } from '@nestjs/common';
import {
  BillingController,
  LocalPaymentSimulatorController,
  PaymeController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { PaymeService } from './payme.service';
import { localToolsEnabled } from '../common/local-tools';

@Module({
  controllers: [
    BillingController,
    PaymeController,
    ...(localToolsEnabled() ? [LocalPaymentSimulatorController] : []),
  ],
  providers: [BillingService, PaymeService],
  exports: [BillingService, PaymeService],
})
export class BillingModule {}
