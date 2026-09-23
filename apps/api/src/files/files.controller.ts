import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsIn, IsString, Length } from 'class-validator';
import { SessionGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/current-user';
import { FilesService } from './files.service';
import type { UploadedDocument } from './files.service';

class LocalFileReviewDto {
  @ApiProperty({ enum: ['CLEAN', 'REJECTED'] }) @IsIn(['CLEAN', 'REJECTED']) status!:
    | 'CLEAN'
    | 'REJECTED';
  @ApiProperty() @IsString() @Length(10, 500) reason!: string;
}
@ApiTags('Private files')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Get() list(@CurrentUser() user: AuthUser) {
    return this.files.list(user);
  }
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedDocument) {
    return this.files.upload(user, file);
  }
  @Get(':id/download') download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.download(user, id);
  }
  @Get(':id/content') async content(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() response: Response,
  ) {
    const { file, buffer } = await this.files.content(user, id, expires, signature);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(buffer);
  }
}
@ApiTags('Local document review')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('developer/files')
export class LocalFilesController {
  constructor(private readonly files: FilesService) {}
  @Post(':id/review') review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: LocalFileReviewDto,
  ) {
    return this.files.reviewLocal(user, id, input.status, input.reason);
  }
}
