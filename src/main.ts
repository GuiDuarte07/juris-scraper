import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; // Importe o ConfigService

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Obtenha o ConfigService do contexto da aplicação para garantir a leitura correta
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  const config = new DocumentBuilder()
    .setTitle('Juris Scraper API')
    .setDescription('Documentação da API de processos')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  console.log(`Swagger API disponível em: http://localhost:${port}/api`);
}

bootstrap();
