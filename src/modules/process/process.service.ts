import { Injectable } from '@nestjs/common';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import XLSX from 'xlsx';
import path from 'path';

@Injectable()
export class ProcessService {
  constructor(
    @InjectRepository(ProcessBatchEntity)
    private readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
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
}
