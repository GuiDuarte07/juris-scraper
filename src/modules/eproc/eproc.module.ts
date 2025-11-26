import { Module } from '@nestjs/common';
import { EprocService } from './eproc.service';
import { EprocController } from './eproc.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ServiceSessionEntity } from 'src/Entities/ServiceSession.entity';
import { EprocWorkerService } from './eprocWorker.service';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

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
      name: 'eproc-process-queue',
    }),
  ],
  controllers: [EprocController],
  providers: [EprocService, EprocWorkerService],
})
export class EprocModule {}
