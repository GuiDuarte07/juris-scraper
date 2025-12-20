import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; // Importe o ConfigService
import { ExpressAdapter } from '@bull-board/express';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { getQueueToken } from '@nestjs/bull';
import { createBullBoard } from '@bull-board/api';
import { Queue } from 'bull';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: true,
  });

  // Obtenha o ConfigService do contexto da aplicação para garantir a leitura correta
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  const config = new DocumentBuilder()
    .setTitle('Juris Scraper API')
    .setDescription('Documentação da API de processos')
    .setVersion('1.0')
    .build();

  const eprocQueue = app.get<Queue>(getQueueToken('eproc-process-queue'));
  const esajQueue = app.get<Queue>(getQueueToken('esaj-process-queue'));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullAdapter(eprocQueue), new BullAdapter(esajQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', serverAdapter.getRouter());

  const client = eprocQueue.client;

  client.on('ready', () => logger.log('Redis ready ✅'));
  client.on('error', (err) => logger.error('Redis error ❌', err));
  client.on('end', () => logger.warn('Redis connection closed ⚠️'));

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  await app.listen(port);

  console.log(`Swagger API disponível em: http://localhost:${port}/api`);
  console.log(
    `Bull Board disponível em: http://localhost:${port}/admin/queues`,
  );
}

bootstrap().catch((err) => {
  console.error('Erro ao iniciar a aplicação:', err);
});
