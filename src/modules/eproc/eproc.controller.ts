import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EprocService } from './eproc.service';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('eproc')
export class EprocController {
  constructor(private readonly eprocService: EprocService) {}

  @ApiOperation({ summary: 'Buscar dados do processo no EPROC' })
  @ApiResponse({
    status: 200,
    description: 'Dados de requerido e valor da causa retornados.',
  })
  @Get('lawsuit/:number')
  async getLawSuitData(@Param('number') number: string) {
    if (number === undefined || number.trim() === '') {
      throw new BadRequestException('Número do processo é obrigatório');
    }

    const lawSuitNumber = number.replace(/\D/g, '');

    try {
      const result = await this.eprocService.scrapeLawSuit(lawSuitNumber);

      return {
        lawsuit: lawSuitNumber,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException('Erro ao processar o pedido' + error);
    }
  }

  @ApiOperation({ summary: 'retorna URL de acesso ao processo no EPROC' })
  @ApiResponse({
    status: 200,
    description: 'URL do processo retornada com sucesso.',
  })
  @Get('lawsuit-url/:number')
  getLawSuitUrl(@Param('number') number: string) {
    if (number === undefined || number.trim() === '') {
      throw new BadRequestException('Número do processo é obrigatório');
    }
    const lawSuitNumber = number.replace(/\D/g, '');
    const url = this.eprocService.getUrl(lawSuitNumber);

    return {
      lawsuit: lawSuitNumber,
      url: url.toString(),
    };
  }

  @ApiOperation({ summary: 'Definir PHPSESSID para sessões do EPROC' })
  @ApiResponse({
    status: 200,
    description: 'PHPSESSID atualizado com sucesso.',
  })
  @Post('set-session')
  async setSession(@Body('sessionId') sessionId: string) {
    if (sessionId === undefined || sessionId.trim() === '') {
      throw new BadRequestException('PHPSESSID é obrigatório');
    }

    await this.eprocService.updateSessionId(sessionId);
  }

  @ApiOperation({
    summary:
      'Importar PDF de lista processo do EPROC para processamento de reqdo e valor',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF processado e dados serão buscados de forma assíncrona.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo PDF de processos',
    required: true,
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        state: {
          type: 'string',
          example: 'SP',
        },
      },
      required: ['file'],
    },
  })
  @Post('import-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async importPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('state') state: string = 'SP',
  ) {
    if (!file || typeof file !== 'object') {
      throw new BadRequestException('Arquivo inválido');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Arquivo deve ser um PDF');
    }

    // Log do arquivo recebido
    console.log(
      'Arquivo recebido:',
      file.originalname,
      'Tamanho:',
      file.size,
      'bytes',
    );

    // Chamar o serviço para importar o PDF
    const result = await this.eprocService.importPdfToDatabase(
      file.buffer,
      'EPROC',
      state,
    );

    return {
      message:
        'PDF importado com sucesso! Os processos serão processados automaticamente.',
      ...result,
    };
  }

  @Get('batch/:batchId')
  async getBatchStatus(@Param('batchId') batchId: number) {
    return await this.eprocService.getBatchStatus(batchId);
  }

  @Get('batch')
  async listProcessingBatches() {
    return await this.eprocService.listProcessingBatches();
  }
}
