import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { BaseWorkerService } from 'src/common/base/base_worker.service';
import { HtmlDataReturnType } from 'src/common/base/base_process.service';
import { EprocService } from './eproc.service';

@Injectable()
export class EprocWorkerService extends BaseWorkerService {
  protected readonly logger = new Logger(EprocWorkerService.name);
  protected readonly system = 'EPROC';

  constructor(
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    private readonly eprocService: EprocService,
  ) {
    super(processRepository, batchRepository);
  }

  protected async processLawSuit(
    process: ProcessEntity,
  ): Promise<HtmlDataReturnType | null> {
    return await this.eprocService.scrapeLawSuit(process.processo);
  }
}
