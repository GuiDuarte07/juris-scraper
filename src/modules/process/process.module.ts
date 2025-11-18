import { Module } from '@nestjs/common';
import { ProcessService } from './process.service';
import { ProcessController } from './process.controller';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessEntity, ProcessBatchEntity])],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule {}
