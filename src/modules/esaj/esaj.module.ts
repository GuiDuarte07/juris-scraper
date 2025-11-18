import { Module } from '@nestjs/common';
import { EsajService } from './esaj.service';
import { EsajController } from './esaj.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessService } from '../process/process.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessEntity, ProcessBatchEntity])],
  controllers: [EsajController],
  providers: [EsajService, ProcessService],
})
export class EsajModule {}
