import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { BaseWorkerService } from 'src/common/base/base_worker.service';
import { HtmlDataReturnType } from 'src/common/base/base_process.service';
import { EprocService } from './eproc.service';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';

@Injectable()
export class EprocWorkerService extends BaseWorkerService {
  protected readonly logger = new Logger(EprocWorkerService.name);
  protected readonly system = 'EPROC';

  constructor(
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    protected readonly batchStatusRepository: Repository<BatchProcessStatusEntity>,
    private readonly eprocService: EprocService,
  ) {
    super(processRepository, batchRepository, batchStatusRepository);
  }

  protected async processLawSuit(
    process: ProcessEntity,
  ): Promise<HtmlDataReturnType | null> {
    return await this.eprocService.scrapeLawSuit(process.processo);
  }
}
