import { EsajWorkerService } from './esajWorker.service';
import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';

@Processor('esaj-queue')
export class EsajProcessor {
  constructor(private readonly esajWorkerService: EsajWorkerService) {}

  @Process()
  async handleEsajJob(job: Job<{ batchId: number }>) {
    const batchId: number = job.data.batchId;

    if (!batchId) {
      return;
    }
    await this.esajWorkerService.startProcessing(batchId);
  }
}
