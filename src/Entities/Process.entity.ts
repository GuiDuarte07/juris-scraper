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

@Entity('process')
export class ProcessEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', comment: 'ID do lote (ProcessBatch)' })
  batchId: number;

  @Column({ type: 'varchar', length: 255 })
  comarca: string;

  @Column({ type: 'varchar', length: 255 })
  foro: string;

  @Column({ type: 'varchar', length: 255 })
  vara: string;

  @Column({ type: 'varchar', length: 255 })
  classe: string;

  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Número CNJ do processo',
  })
  processo: string;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  valor?: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Nome do requerido',
  })
  requerido?: string;

  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
    comment: 'Forma de contato do requerido',
  })
  contato: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Se já foi entrado em contato com o requerido',
  })
  contatoRealizado: boolean;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Observações sobre o contato',
  })
  observacoes: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Se o processo já foi enriquecido com dados do site',
  })
  processed: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Se o processo falhou ao ser processado',
  })
  failed: boolean;

  @Column({
    type: 'integer',
    default: 0,
    comment: 'Número de tentativas falhadas',
  })
  errorCount: number;

  @Column({ type: 'text', nullable: true, comment: 'Última mensagem de erro' })
  lastError: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProcessBatchEntity, (batch) => batch.processes)
  @JoinColumn({ name: 'batchId' })
  batch: ProcessBatchEntity;
}
