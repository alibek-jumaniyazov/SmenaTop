import { Module } from '@nestjs/common';
import {
  BillingController,
  LocalPaymentSimulatorController,
  PaymeController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { PaymeService } from './payme.service';

@Module({
  controllers: [
    BillingController,
    PaymeController,
    ...(process.env.APP_ENV !== 'production' && process.env.NODE_ENV !== 'production'
      ? [LocalPaymentSimulatorController]
      : []),
  ],
  providers: [BillingService, PaymeService],
  exports: [BillingService, PaymeService],
})
export class BillingModule {}
