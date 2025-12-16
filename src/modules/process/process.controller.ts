import {
  Controller,
  Patch,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ProcessService } from './process.service';
import { ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

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
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Erro ao atualizar processo',
      );
    }
  }
}
