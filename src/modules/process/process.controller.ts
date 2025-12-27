import {
  Controller,
  Patch,
  Param,
  Body,
  BadRequestException,
  Get,
  Query,
  Res,
  Delete,
  InternalServerErrorException,
} from '@nestjs/common';
import { ProcessService } from './process.service';
import { ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';

@Controller('process')
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  @Patch(':processId/contact')
  @ApiOperation({ summary: 'Atualizar informações de contato de um processo' })
  @ApiResponse({
    status: 200,
    description: 'Informações de contato atualizadas com sucesso.',
  })
  @ApiBody({
    description: 'Dados de contato a atualizar',
    schema: {
      type: 'object',
      properties: {
        contato: {
          type: 'string',
          example: '(11) 98765-4321',
          description: 'Forma de contato do requerido',
        },
        contatoRealizado: {
          type: 'boolean',
          example: true,
          description: 'Se já foi entrado em contato',
        },
        observacoes: {
          type: 'string',
          example: 'Contato realizado com sucesso',
          description: 'Observações sobre o contato',
        },
      },
    },
  })
  async updateProcessContact(
    @Param('processId') processId: number,
    @Body()
    updateData: {
      contato?: string;
      contatoRealizado?: boolean;
      observacoes?: string;
    },
  ) {
    if (!processId || isNaN(Number(processId))) {
      throw new BadRequestException('ID do processo inválido');
    }

    try {
      const updatedProcess = await this.processService.updateProcessContact(
        Number(processId),
        updateData,
      );

      return {
        message: 'Informações de contato atualizadas com sucesso.',
        process: {
          id: updatedProcess.id,
          processo: updatedProcess.processo,
          contato: updatedProcess.contato,
          contatoRealizado: updatedProcess.contatoRealizado,
          observacoes: updatedProcess.observacoes,
        },
      };
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'Erro ao atualizar processo',
      );
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Listar processos com paginação, filtros e ordenação',
  })
  @ApiResponse({ status: 200, description: 'Lista de processos' })
  async listProcesses(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('sortBy') sortBy = 'updatedAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Query('processed') processed?: string,
    @Query('batchId') batchId?: string,
    @Query('filters') filtersParam?: string,
  ) {
    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(limit) || 50;
    const parsedBatchId = batchId ? Number(batchId) : undefined;
    const parsedProcessed =
      processed !== undefined
        ? processed === 'true' || processed === '1'
        : undefined;

    // Parse advanced filters from JSON string
    let parsedFilters: Array<{ field: string; operator: string; value: any }> =
      [];
    if (filtersParam) {
      try {
        const decoded = decodeURIComponent(filtersParam);
        parsedFilters = JSON.parse(decoded) as typeof parsedFilters;
      } catch (error) {
        console.warn('Failed to parse filters:', error);
        parsedFilters = [];
      }
    }

    const result = await this.processService.getProcesses({
      page: parsedPage,
      limit: parsedLimit,
      sortBy,
      sortOrder,
      processed: parsedProcessed,
      batchId: parsedBatchId,
      filters: parsedFilters.length > 0 ? parsedFilters : undefined,
    });

    return result;
  }

  // Unified batch endpoints
  private normalizeSystem(system?: string) {
    if (!system) return undefined;
    const s = system.toString().trim().toLowerCase();
    if (s === 'eproc') return 'EPROC';
    if (s === 'esaj') return 'ESAJ';
    return undefined;
  }

  @Get('batch/:batchId')
  @ApiOperation({
    summary: 'Retorna status do lote por ID (opcional system query)',
  })
  async getBatchStatusUnified(@Param('batchId') batchId: number) {
    if (isNaN(Number(batchId))) {
      throw new BadRequestException('ID do lote inválido');
    }

    return await this.processService.getBatchStatus(Number(batchId));
  }

  @Get('batch')
  @ApiOperation({
    summary: 'Lista lotes em processamento',
  })
  async listProcessingBatchesUnified() {
    return await this.processService.listProcessingBatches();
  }

  @Delete('batch/:batchId')
  @ApiOperation({
    summary: 'Deleta todos os processos de um lote (opcional system query)',
  })
  async deleteBatchUnified(@Param('batchId') batchId: number) {
    if (isNaN(Number(batchId))) {
      throw new BadRequestException('ID do lote inválido');
    }

    return await this.processService.deleteProcessesByBatchId(Number(batchId));
  }

  @Get('export/batch/:batchId')
  @ApiOperation({
    summary: 'Exportar processos de um lote para Excel (usa ProcessService)',
  })
  async exportBatchToExcelUnified(
    @Param('batchId') batchId: number,
    @Res() res: Response,
  ) {
    try {
      if (isNaN(Number(batchId))) {
        throw new BadRequestException('ID do lote inválido');
      }

      const result = await this.processService.exportBatchToExcel(
        Number(batchId),
      );
      res.download(result.filePath, result.filename, (err?: Error) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        try {
          fs.unlinkSync(result.filePath);
        } catch (e) {
          console.warn('Erro ao deletar arquivo temporário:', e);
        }
      });
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException(
        'Erro ao exportar lote para Excel',
      );
    }
  }
}
