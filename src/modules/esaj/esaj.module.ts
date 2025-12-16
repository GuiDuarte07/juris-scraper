import { Module } from '@nestjs/common';
import { EsajService } from './esaj.service';
import { EsajController } from './esaj.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessService } from '../process/process.service';
import { ServiceSessionEntity } from 'src/Entities/ServiceSession.entity';
import { EsajWorkerService } from './esajWorker.service';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { EsajProcessor } from './esaj.processor';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      ProcessEntity,
      ProcessBatchEntity,
      ServiceSessionEntity,
      BatchProcessStatusEntity,
    ]),
    BullModule.registerQueue({
      name: 'esaj-process-queue',
    }),
  ],
  controllers: [EsajController],
  providers: [EsajService, ProcessService, EsajWorkerService, EsajProcessor],
})
export class EsajModule {}
