import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AttendanceTokenDto {
  @ApiProperty({ enum: ['CHECK_IN', 'CHECK_OUT'] }) @IsIn(['CHECK_IN', 'CHECK_OUT']) kind!: string;
}
export class AttendanceDto extends AttendanceTokenDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(20, 200) token?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 1000) reason?: string;
}
export class ReasonDto {
  @ApiProperty() @IsString() @Length(5, 1000) reason!: string;
}
export class CorrectionDto extends ReasonDto {
  @ApiProperty() @IsString() startedAt!: string;
  @ApiProperty() @IsString() endedAt!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(480) breakMinutes!: number;
}
export class ReviewDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiProperty() @IsString() @Length(5, 2000) text!: string;
}
export class DisputeDto {
  @ApiProperty({ enum: ['ATTENDANCE', 'PAYMENT', 'CONDUCT', 'OTHER'] })
  @IsIn(['ATTENDANCE', 'PAYMENT', 'CONDUCT', 'OTHER'])
  category!: string;
  @ApiProperty() @IsString() @Length(10, 4000) description!: string;
}
export class TextMessageDto {
  @ApiProperty() @IsString() @Length(1, 2000) text!: string;
}
export class SupportDto {
  @ApiProperty() @IsString() @Length(5, 200) subject!: string;
  @ApiProperty() @IsString() @Length(10, 4000) description!: string;
}
export class ResolutionDto {
  @ApiProperty() @IsString() @Length(10, 4000) resolution!: string;
}
export class VerificationReviewDto extends ReasonDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] }) @IsIn(['VERIFIED', 'REJECTED']) status!: string;
}
