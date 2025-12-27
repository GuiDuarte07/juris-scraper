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
import { EprocService } from './eproc.service';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

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

    // Verifica se o cookie está atualizado
    const session = await this.eprocService.getSessionId();

    if (!session || !session.cookie) {
      throw new BadRequestException(
        'Sessão inválida. Defina o PHPSESSID antes de importar o PDF.',
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new BadRequestException(
        'Sessão expirada. Atualize o PHPSESSID antes de importar o PDF.',
      );
    }

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

  @ApiOperation({
    summary: 'Lista todos os lotes (todos os status) para o EPROC',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de lotes retornada com sucesso.',
  })
  @Get('batch')
  async listAllBatches() {
    return await this.eprocService.listAllBatches();
  }

  @ApiOperation({
    summary: 'Lista todos os lotes de processos que estão em processamento',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de lotes em processamento retornada com sucesso.',
  })
  @Get('batch/processing')
  async listProcessingBatches() {
    return await this.eprocService.listProcessingBatches();
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
    return await this.eprocService.getBatchStatus(batchId);
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
    return await this.eprocService.deleteProcessesByBatchId(batchId);
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

      const result = await this.eprocService.exportProcessToExcel(batchId);
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
