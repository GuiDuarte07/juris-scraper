import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ProcessEntity } from './Process.entity';

@Entity('process_batch')
export class ProcessBatchEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 50,
    comment: 'Sistema de origem (ESAJ, EPROC, etc)',
  })
  system: string;

  @Column({ type: 'varchar', length: 2, default: 'SP', comment: 'Estado (UF)' })
  state: string;

  @Column({ type: 'timestamp', comment: 'Data dos processos' })
  processDate: Date;

  @Column({ type: 'text', comment: 'Descrição do lote de processos' })
  description: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Se todos os processos do lote foram processados',
  })
  processed: boolean;

  @Column({
    type: 'integer',
    default: 0,
    comment: 'Total de processos no lote',
  })
  totalProcesses: number;

  @Column({
    type: 'integer',
    default: 0,
    comment: 'Quantidade de processos já processados',
  })
  processedCount: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => ProcessEntity, (process) => process.batch, { cascade: true })
  processes: ProcessEntity[];
}
