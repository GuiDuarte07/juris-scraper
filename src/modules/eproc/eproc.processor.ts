import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { EprocWorkerService } from './eprocWorker.service';

@Processor('eproc-queue')
export class EprocProcessor {
  constructor(private readonly eprocWorkerService: EprocWorkerService) {}

  @Process()
  async handleEprocJob(job: Job<{ batchId: number }>) {
    const batchId: number = job.data.batchId;

    if (!batchId) {
      return;
    }
    await this.eprocWorkerService.startProcessing(batchId);
  }
}
