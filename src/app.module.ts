import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EprocModule } from './modules/eproc/eproc.module';
import { ProcessModule } from './modules/process/process.module';
import { EsajModule } from './modules/esaj/esaj.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    EprocModule,
    EsajModule,
    ProcessModule,
    TypeOrmModule.forRoot(databaseConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
