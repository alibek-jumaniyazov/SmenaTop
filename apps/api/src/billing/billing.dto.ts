import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CheckoutDto {
  @ApiProperty() @IsUUID() planVersionId!: string;
  @ApiProperty({ enum: ['MOCK', 'PAYME', 'CLICK', 'BANK'] })
  @IsIn(['MOCK', 'PAYME', 'CLICK', 'BANK'])
  provider!: string;
}
export class CancelSubscriptionDto {
  @ApiProperty() @IsBoolean() cancelAtPeriodEnd!: boolean;
}
export class SimulateDto {
  @ApiProperty({
    enum: [
      'success',
      'failure',
      'pending',
      'cancel',
      'duplicate',
      'late',
      'wrong_amount',
      'invalid_auth',
    ],
  })
  @IsIn([
    'success',
    'failure',
    'pending',
    'cancel',
    'duplicate',
    'late',
    'wrong_amount',
    'invalid_auth',
  ])
  scenario!: string;
}
export class RefundDto {
  @ApiProperty() @IsString() @Length(10, 1000) reason!: string;
}
export class BankEvidenceDto {
  @ApiProperty() @IsString() @Length(5, 200) bankReference!: string;
  @ApiProperty() @IsUUID() evidenceFileId!: string;
}
export class BankConfirmDto extends BankEvidenceDto {
  @ApiProperty() @Matches(/^\d{1,18}$/) amountMinor!: string;
  @ApiProperty() @IsString() @Length(10, 1000) reason!: string;
  @ApiProperty({
    description: 'Finance independently checked receipt on the operator bank statement.',
  })
  @Equals(true)
  independentlyVerified!: boolean;
}

export class PlanVersionDto {
  @ApiProperty() @Matches(/^\d{1,15}$/) priceMinor!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) branchLimit!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) memberLimit!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) publishLimit!: number;
  @ApiProperty() @IsString() @Length(10, 1000) reason!: string;
}
