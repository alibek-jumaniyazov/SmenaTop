import { Module } from '@nestjs/common';
import { FilesController, LocalFilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
import { localToolsEnabled } from '../common/local-tools';

@Module({
  controllers: [FilesController, ...(localToolsEnabled() ? [LocalFilesController] : [])],
  providers: [FilesService, StorageService],
})
export class FilesModule {}
