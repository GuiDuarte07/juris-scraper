import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; // Importe o ConfigService

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Obtenha o ConfigService do contexto da aplicação para garantir a leitura correta
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  // --- INÍCIO DO CONSOLE.LOG PARA VERIFICAÇÃO ---
  // Mover este bloco para ANTES de app.listen()
  console.log('--- Configuração do Banco de Dados (main.ts) ---');
  console.log(
    `DB_HOST: ${configService.get<string>('DB_HOST') || 'localhost'}`,
  );
  console.log(`DB_PORT: ${configService.get<number>('DB_PORT') || 5432}`);
  console.log(`DB_USER: ${configService.get<string>('DB_USER') || 'root'}`);
  console.log(
    `DB_PASS: ${configService.get<string>('DB_PASS') ? '****** (Definido)' : '(Não Definido)'}`,
  );
  console.log(`DB_NAME: ${configService.get<string>('DB_NAME') || 'juris_db'}`);
  console.log('------------------------------------------------');
  // --- FIM DO CONSOLE.LOG PARA VERIFICAÇÃO ---

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
