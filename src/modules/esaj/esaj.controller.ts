import { ProcessService } from './../process/process.service';
import * as fs from 'fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EsajService } from './esaj.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
  @ApiOperation({
    summary:
      'Retorna o status de processamento do lote de processos importados via PDF',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do lote retornado com sucesso.',
  })
  @Get('batch/:batchId')
  async getBatchStatus(@Param('batchId') batchId: number) {
    return await this.esajService.getBatchStatus(batchId);
  }

  @ApiOperation({
    summary: 'Lista todos os lotes de processos que estão em processamento',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de lotes em processamento retornada com sucesso.',
  })
  @Get('batch')
  async listProcessingBatches() {
    return await this.esajService.listProcessingBatches();
  }
  @ApiOperation({
    summary: 'Deletar todos os processos de um lote específico',
  })
  @ApiResponse({
    status: 204,
    description: 'Lote deletado com sucesso.',
  })
  @Delete('batch/:batchId')
  @HttpCode(204)
  async deleteBatch(@Param('batchId') batchId: number) {
    await this.esajService.deleteProcessesByBatchId(batchId);
  }

  @Get('/export/batch/:batchId')
  @ApiOperation({ summary: 'Exportar processos de um lote para Excel' })
  async exportBatchToExcel(
    @Param('batchId') batchId: number,
    @Res() res: Response,
  ) {
    try {
      if (isNaN(Number(batchId))) {
        throw new BadRequestException('ID do lote inválido');
      }

      const result = await this.esajService.exportProcessToExcel(batchId);
      res.download(result.filePath, result.filename, (err?: Error) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        // Deletar arquivo após envio
        fs.unlinkSync(result.filePath);
      });
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException(
        'Erro ao exportar lote para Excel',
      );
    }
  }
}
