import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { NotificationStreamService } from './notification-stream.service';

@Module({
  controllers: [OperationsController],
  providers: [OperationsService, NotificationStreamService],
  exports: [OperationsService],
})
export class OperationsModule {}
