import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

export const databaseConfig = (config: ConfigService): DataSourceOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST'),
  port: config.get<number>('DB_PORT'),
  username: config.get<string>('DB_USER'),
  password: config.get<string>('DB_PASS'),
  database: config.get<string>('DB_NAME'),
  entities: [__dirname + '/../Entities/*.entity.{ts,js}'],
  synchronize: true,
  logging: false,
});
