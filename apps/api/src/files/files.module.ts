import { Module } from '@nestjs/common';
import { FilesController, LocalFilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [
    FilesController,
    ...(process.env.APP_ENV === 'production' ? [] : [LocalFilesController]),
  ],
  providers: [FilesService, StorageService],
})
export class FilesModule {}
