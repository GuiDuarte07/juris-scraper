import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios/dist/http.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EprocModule } from './modules/eproc/eproc.module';
import { ProcessModule } from './modules/process/process.module';
import { EsajModule } from './modules/esaj/esaj.module';
import { AuthModule } from './modules/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HttpModule,
    AuthModule,
    EprocModule,
    EsajModule,
    ProcessModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => databaseConfig(config),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
