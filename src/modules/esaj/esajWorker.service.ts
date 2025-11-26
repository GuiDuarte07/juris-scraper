import { EsajService } from './esaj.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { BaseWorkerService } from 'src/common/base/base_worker.service';
import { HtmlDataReturnType } from 'src/common/base/base_process.service';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';

@Injectable()
export class EsajWorkerService extends BaseWorkerService {
  protected readonly logger = new Logger(EsajWorkerService.name);
  protected readonly system = 'ESAJ';

  constructor(
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    protected readonly batchStatusRepository: Repository<BatchProcessStatusEntity>,
    private readonly esajService: EsajService,
  ) {
    super(processRepository, batchRepository, batchStatusRepository);
  }

  public async processLawSuit(
    process: ProcessEntity,
  ): Promise<HtmlDataReturnType | null> {
    return await this.esajService.scrapeLawSuit(process.processo);
  }
}
