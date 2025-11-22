import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('service_session')
export class ServiceSessionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  service_name: string;

  @Column({ type: 'varchar', length: 255 })
  session_id: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
