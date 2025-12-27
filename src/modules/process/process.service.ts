import { Injectable } from '@nestjs/common';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import XLSX from 'xlsx';
import path from 'path';
import { BatchWithStatusDTO } from './DTOs/BatchWithStatusDTO';

@Injectable()
export class ProcessService {
  constructor(
    @InjectRepository(ProcessBatchEntity)
    private readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    private readonly statusRepository: Repository<BatchProcessStatusEntity>,
  ) {}

  /**
   * Exporta processos de um lote específico para Excel
   * @param {number} batchId - ID do lote
   * @returns {string} - Caminho do arquivo gerado
   */
  public async exportBatchToExcel(batchId: number) {
    // Buscar informações do lote
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error(`Lote com ID ${batchId} não encontrado`);
    }

    // Buscar todos os processos do lote
    const processes = await this.processRepository.find({
      where: { batchId },
      order: { id: 'ASC' },
    });

    if (processes.length === 0) {
      throw new Error(`Nenhum processo encontrado no lote ${batchId}`);
    }

    // Preparar dados para o Excel
    const excelData = processes.map((p) => ({
      Comarca: p.comarca,
      Foro: p.foro,
      Vara: p.vara,
      Classe: p.classe,
      Processo: p.processo,
      Valor: p.valor || 'Não processado',
      Requerido: p.requerido || 'Não processado',
      Status: p.processed ? 'Processado' : 'Pendente',
      Erros: p.errorCount || 0,
    }));

    // Criar a worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Ajustar larguras das colunas
    const columnWidths = [
      { wch: 25 }, // Comarca
      { wch: 30 }, // Foro
      { wch: 40 }, // Vara
      { wch: 30 }, // Classe
      { wch: 30 }, // Processo
      { wch: 20 }, // Valor
      { wch: 50 }, // Requerido
      { wch: 12 }, // Status
      { wch: 8 }, // Erros
    ];
    worksheet['!cols'] = columnWidths;

    // Criar o workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processos');

    // Gerar nome do arquivo
    const dateStr = new Date(batch.processDate).toISOString().split('T')[0];
    const filename = `processos_${batch.system}_${batch.state}_${dateStr}_${batchId}.xlsx`;
    const filePath = path.resolve(filename);

    // Escrever o arquivo
    XLSX.writeFile(workbook, filePath);

    console.log(`✓ Arquivo Excel criado: ${filePath}`);

    return {
      filePath,
      filename,
      totalProcesses: processes.length,
      processedCount: processes.filter((p) => p.processed).length,
      batch: {
        id: batch.id,
        system: batch.system,
        state: batch.state,
        date: batch.processDate,
      },
    };
  }

  /**
   * Atualiza os dados de contato de um processo
   * @param {number} processId - ID do processo
   * @param {Partial<ProcessEntity>} updateData - Dados a atualizar (contato, contatoRealizado, observacoes)
   * @returns {ProcessEntity} - Processo atualizado
   */
  public async updateProcessContact(
    processId: number,
    updateData: {
      contato?: string;
      contatoRealizado?: boolean;
      observacoes?: string;
    },
  ): Promise<ProcessEntity> {
    const process = await this.processRepository.findOne({
      where: { id: processId },
    });

    if (!process) {
      throw new Error(`Processo com ID ${processId} não encontrado`);
    }

    // Atualizar apenas os campos fornecidos
    if (updateData.contato !== undefined) {
      process.contato = updateData.contato;
    }
    if (updateData.contatoRealizado !== undefined) {
      process.contatoRealizado = updateData.contatoRealizado;
    }
    if (updateData.observacoes !== undefined) {
      process.observacoes = updateData.observacoes;
    }

    return await this.processRepository.save(process);
  }

  /**
   * Busca processos com paginação, ordenação e filtros
   */
  public async getProcesses(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    processed?: boolean;
    batchId?: number;
    // advanced filters: array of { field, operator, value }
    filters?: Array<{ field: string; operator: string; value: any }>;
  }) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const sortBy = options.sortBy || 'updatedAt';
    const order =
      options.sortOrder && options.sortOrder.toUpperCase() === 'ASC'
        ? 'ASC'
        : 'DESC';

    const qb = this.processRepository.createQueryBuilder('process');

    // Simple filters
    if (options.batchId) {
      qb.andWhere('process.batchId = :batchId', { batchId: options.batchId });
    }

    if (options.processed !== undefined) {
      qb.andWhere('process.processed = :processed', {
        processed: options.processed,
      });
    }

    // Apply advanced filters if provided (array of { field, operator, value })
    // Supported operators: equals, notEquals, contains, startsWith, endsWith,
    // greaterThan, lessThan, greaterOrEqual, lessOrEqual, true, false, all
    if (
      options.filters &&
      Array.isArray(options.filters) &&
      options.filters.length > 0
    ) {
      options.filters.forEach((f, idx) => {
        if (!f || !f.field) return;
        const field = String(f.field).replace(/[^a-zA-Z0-9_]/g, '');
        const param = `filter_${idx}`;
        const rawValue: any = f.value;

        switch (f.operator) {
          case 'equals': {
            if (rawValue === null) {
              qb.andWhere(`process.${field} IS NULL`);
            } else if (
              typeof rawValue === 'number' ||
              !isNaN(Number(rawValue))
            ) {
              qb.andWhere(`process.${field} = :${param}`, {
                [param]: Number(rawValue),
              });
            } else {
              qb.andWhere(`process.${field} ILIKE :${param}`, {
                [param]: String(rawValue),
              });
            }
            break;
          }
          case 'notEquals': {
            if (rawValue === null) {
              qb.andWhere(`process.${field} IS NOT NULL`);
            } else if (
              typeof rawValue === 'number' ||
              !isNaN(Number(rawValue))
            ) {
              qb.andWhere(`process.${field} <> :${param}`, {
                [param]: Number(rawValue),
              });
            } else {
              qb.andWhere(`process.${field} NOT ILIKE :${param}`, {
                [param]: String(rawValue),
              });
            }
            break;
          }
          case 'contains': {
            qb.andWhere(`process.${field} ILIKE :${param}`, {
              [param]: `%${String(rawValue)}%`,
            });
            break;
          }
          case 'startsWith': {
            qb.andWhere(`process.${field} ILIKE :${param}`, {
              [param]: `${String(rawValue)}%`,
            });
            break;
          }
          case 'endsWith': {
            qb.andWhere(`process.${field} ILIKE :${param}`, {
              [param]: `%${String(rawValue)}`,
            });
            break;
          }
          case 'greaterThan': {
            qb.andWhere(`process.${field} > :${param}`, {
              [param]: Number(rawValue),
            });
            break;
          }
          case 'lessThan': {
            qb.andWhere(`process.${field} < :${param}`, {
              [param]: Number(rawValue),
            });
            break;
          }
          case 'greaterOrEqual': {
            qb.andWhere(`process.${field} >= :${param}`, {
              [param]: Number(rawValue),
            });
            break;
          }
          case 'lessOrEqual': {
            qb.andWhere(`process.${field} <= :${param}`, {
              [param]: Number(rawValue),
            });
            break;
          }
          case 'true': {
            qb.andWhere(`process.${field} = :${param}`, { [param]: true });
            break;
          }
          case 'false': {
            qb.andWhere(`process.${field} = :${param}`, { [param]: false });
            break;
          }
          case 'all':
          default:
            break;
        }
      });
    }

    // Filtrar requerido não vazio e diferente de REPROCESSAR
    qb.andWhere(
      "process.requerido IS NOT NULL AND process.requerido <> '' AND process.requerido <> :reprocessar",
      { reprocessar: 'REPROCESSAR' },
    );

    // total
    const total = await qb.getCount();

    // ordenação e paginação
    qb.orderBy(`process.${sortBy}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const items = await qb.getMany();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retorna status de um lote pelo ID
   * @param {number} batchId - ID do lote
   * @returns {BatchWithStatusDTO} - Dados da batch com status
   */
  public async getBatchStatus(
    batchId: number,
  ): Promise<BatchWithStatusDTO | null> {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      return null;
    }

    const status = await this.statusRepository.findOne({
      where: { batchId },
    });

    const totalProcesses = await this.processRepository.count({
      where: { batchId },
    });

    const processedCount = await this.processRepository.count({
      where: { batchId, processed: true },
    });

    const remainingCount = totalProcesses - processedCount;
    const progress =
      totalProcesses > 0 ? (processedCount / totalProcesses) * 100 : 0;

    return {
      id: batch.id,
      system: batch.system,
      state: batch.state,
      processDate: batch.processDate,
      description: batch.description,
      processed: batch.processed,
      status: status
        ? {
            id: status.id,
            batchId: status.batchId,
            totalProcesses: status.totalProcesses,
            processedProcesses: status.processedProcesses,
            processedCount,
            pendingProcesses: remainingCount,
            errorProcesses: status.errorProcesses,
            percentComplete: status.percentComplete,
            progress,
            status: status.status,
            createdAt: status.createdAt,
            updatedAt: status.updatedAt,
          }
        : null,
    } as BatchWithStatusDTO;
  }

  /**
   * Lista lotes em processamento
   * @param {string} system - Filtro opcional por sistema (EPROC ou ESAJ)
   * @returns {BatchWithStatusDTO[]} - Array de lotes com status
   */
  public async listProcessingBatches(
    system?: string,
  ): Promise<BatchWithStatusDTO[]> {
    const qb = this.batchRepository.createQueryBuilder('batch');

    if (system) {
      const normalizedSystem = system.toUpperCase();
      qb.andWhere('batch.system = :system', { system: normalizedSystem });
    }

    const batches = await qb.getMany();

    // Enriquecer com contagem de processos e status
    const enrichedBatches = await Promise.all(
      batches.map(async (batch): Promise<BatchWithStatusDTO> => {
        const totalProcesses = await this.processRepository.count({
          where: { batchId: batch.id },
        });

        const processedCount = await this.processRepository.count({
          where: { batchId: batch.id, processed: true },
        });

        const remainingCount = totalProcesses - processedCount;
        const progress =
          totalProcesses > 0 ? (processedCount / totalProcesses) * 100 : 0;

        const batchStatus = await this.statusRepository.findOne({
          where: { batchId: batch.id },
        });

        return {
          id: batch.id,
          system: batch.system,
          state: batch.state,
          processDate: batch.processDate,
          description: batch.description,
          processed: batch.processed,
          status: batchStatus
            ? {
                id: batchStatus.id,
                batchId: batchStatus.batchId,
                totalProcesses: batchStatus.totalProcesses,
                processedProcesses: batchStatus.processedProcesses,
                processedCount,
                pendingProcesses: remainingCount,
                errorProcesses: batchStatus.errorProcesses,
                percentComplete: batchStatus.percentComplete,
                progress,
                status: batchStatus.status,
                createdAt: batchStatus.createdAt,
                updatedAt: batchStatus.updatedAt,
              }
            : undefined,
        };
      }),
    );

    return enrichedBatches;
  }

  /**
   * Deleta todos os processos de um lote
   * @param {number} batchId - ID do lote
   */
  public async deleteProcessesByBatchId(batchId: number) {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error(`Lote com ID ${batchId} não encontrado`);
    }

    await this.processRepository.delete({ batchId });
    await this.batchRepository.delete({ id: batchId });

    return {
      message: `Lote ${batchId} e todos seus processos foram deletados`,
    };
  }
}
