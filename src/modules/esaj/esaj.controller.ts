import { ProcessService } from './../process/process.service';
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
import { EsajService } from './esaj.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@Controller('esaj')
export class EsajController {
  constructor(
    private readonly esajService: EsajService,
    private readonly processService: ProcessService,
  ) {}

  @ApiOperation({ summary: 'Buscar dados do processo no ESAJ' })
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
      const result = await this.esajService.scrapeLawSuit(lawSuitNumber);

      return {
        lawsuit: lawSuitNumber,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException('Erro ao processar o pedido' + error);
    }
  }

  @ApiOperation({ summary: 'retorna URL de acesso ao processo no ESAJ' })
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
    const url = this.esajService.getUrl(lawSuitNumber);

    return {
      lawsuit: lawSuitNumber,
      url: url.toString(),
    };
  }

  @ApiOperation({
    summary:
      'Importar PDF de lista processo do ESAJ para processamento de reqdo e valor',
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
    const result = await this.esajService.importPdfToDatabase(
      file.buffer,
      'ESAJ',
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
    return await this.esajService.getBatchStatus(batchId);
  }

  @Get('batch')
  async listProcessingBatches() {
    return await this.esajService.listProcessingBatches();
  }
}
