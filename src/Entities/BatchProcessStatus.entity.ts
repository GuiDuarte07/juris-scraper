import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProcessBatchEntity } from './ProcessBatch.entity';

@Entity('batch_process_status')
export class BatchProcessStatusEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batchId: number;

  @ManyToOne(() => ProcessBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: ProcessBatchEntity;

  @Column({ type: 'integer', default: 0 })
  totalProcesses: number;

  @Column({ type: 'integer', default: 0 })
  processedProcesses: number;

  @Column({ type: 'integer', default: 0 })
  pendingProcesses: number;

  @Column({ type: 'integer', default: 0 })
  errorProcesses: number;

  @Column({ type: 'float', default: 0 })
  percentComplete: number;

  @Column({ type: 'varchar', length: 20, default: 'processing' })
  status: string; // processing, completed, error, etc

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
