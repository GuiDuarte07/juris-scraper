import { BatchStatusDTO } from './BatchStatusDTO';

export class BatchWithStatusDTO {
  id: number;
  system: string;
  state: string;
  processDate: Date;
  description: string;
  processed: boolean;
  status?: BatchStatusDTO;
}
