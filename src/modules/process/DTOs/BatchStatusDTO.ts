export class BatchStatusDTO {
  id: number;
  batchId: number;
  totalProcesses: number;
  processedProcesses: number;
  processedCount: number;
  pendingProcesses: number;
  errorProcesses: number;
  percentComplete: number;
  progress: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
