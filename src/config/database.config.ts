import { DataSourceOptions } from 'typeorm';

export const databaseConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'juris_db',
  entities: [__dirname + '/../Entities/*.entity.{ts,js}'],
  synchronize: true,
  logging: false,
};
