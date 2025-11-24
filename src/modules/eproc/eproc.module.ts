import { Module } from '@nestjs/common';
import { EprocService } from './eproc.service';
import { EprocController } from './eproc.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ServiceSessionEntity } from 'src/Entities/ServiceSession.entity';
import { EprocWorkerService } from './eprocWorker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcessEntity,
      ProcessBatchEntity,
      ServiceSessionEntity,
    ]),
  ],
  controllers: [EprocController],
  providers: [EprocService],
})
export class EprocModule {}
