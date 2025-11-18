import { Module } from '@nestjs/common';
import { EprocService } from './eproc.service';
import { EprocController } from './eproc.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessEntity, ProcessBatchEntity])],
  controllers: [EprocController],
  providers: [EprocService],
})
export class EprocModule {}
