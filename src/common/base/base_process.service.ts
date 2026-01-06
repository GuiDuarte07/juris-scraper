import XLSX from 'xlsx';
import { BadRequestException, Injectable } from '@nestjs/common';
import iconv from 'iconv-lite';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { InjectRepository } from '@nestjs/typeorm';
import UtilityClass from 'src/Helpers/UtilityClass';
import { IProcessHeader } from 'src/modules/process/DTOs/IProcessHeader';
import { IProcess } from 'src/modules/process/DTOs/ProcessDTO';
import { lastValueFrom } from 'rxjs/internal/lastValueFrom';
import { HttpService } from '@nestjs/axios';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import path from 'path/win32';
import { ExportProcessExcelResult } from '../types/ExportProcessExcelResult';
export type HtmlDataReturnType = {
  reqdo: string;
  value: number;
};

@Injectable()
export abstract class BaseProcessService {
  protected readonly regexCNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

  protected abstract getExtraHeaders(): Record<string, string> | null;

  constructor(
    protected readonly httpService: HttpService,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    protected readonly batchStatusRepository: Repository<BatchProcessStatusEntity>,
  ) {}

  public abstract getDataFromHTML(html: string): HtmlDataReturnType;

  public abstract getUrl(lawSuitNumber: string): string;

  protected abstract addToProcessQueue(batchId: number): Promise<void>;

  public async deleteProcessesByBatchId(batchId: number): Promise<void> {
    try {
      await this.processRepository.delete({ batchId }).then(() => {});

      await this.batchRepository.delete({ id: batchId }).then(() => {});

      await this.batchStatusRepository.delete({ batchId }).then(() => {});
    } catch (error) {
      throw new BadRequestException(
        `Erro ao deletar processos e lote com batchId ${batchId}: ${error}`,
      );
    }
  }

  public async scrapeLawSuit(
    lawSuitNumber: string,
  ): Promise<HtmlDataReturnType | null> {
    try {
      const url = this.getUrl(lawSuitNumber);

      let result: HtmlDataReturnType | null = null;

      for (let tries = 0; tries <= 2; tries++) {
        await this.sleep(tries * 1000);

        if (result && result.reqdo === 'REPROCESSAR') {
          console.log(lawSuitNumber + ' - Não processou ' + tries);
        }

        result = await this.fetchData(url);

        if (!(result.reqdo === 'REPROCESSAR' && result.value === 0)) {
          break;
        }
      }

      return result;
    } catch (err) {
      throw new Error(String(err));
    }
  }

  public async importPdfToDatabase(
    pdfBuffer: Express.Multer.File['buffer'],
    system: string,
    state: string,
  ) {
    console.log('Processando PDF para extrair dados...');

    const { header: headerInfo, processes: uniqueProcessData } =
      await this.processPdfToArray(pdfBuffer);

    console.log('Verificando processos que já existem no banco...');

    // Verificar quais processos já existem no banco
    const processNumbers = uniqueProcessData.map((p) => p.processo);

    // Query existing processes in chunks to avoid sending too many parameters
    // in a single SQL statement (which can break the Postgres wire protocol).
    const existingProcesses: ProcessEntity[] = [];
    const queryChunkSize = 1000;

    for (let j = 0; j < processNumbers.length; j += queryChunkSize) {
      const chunk = processNumbers.slice(j, j + queryChunkSize);
      const found = await this.processRepository
        .createQueryBuilder('process')
        .select(['process.processo', 'process.id', 'process.batchId'])
        .where('process.processo IN (:...chunk)', { chunk })
        .getMany();

      if (found && found.length > 0) {
        existingProcesses.push(...found);
      }
    }

    const existingProcessNumbers = new Set(
      existingProcesses.map((p) => p.processo),
    );
    const newProcesses = uniqueProcessData.filter(
      (p) => !existingProcessNumbers.has(p.processo),
    );
    const duplicateCount = uniqueProcessData.length - newProcesses.length;

    if (duplicateCount > 0) {
      console.log(
        `   ⚠️  ${duplicateCount} processos já existem no banco e serão ignorados`,
      );
    }

    if (newProcesses.length === 0) {
      const batchIdExisting = existingProcesses[0]?.batchId;

      if (batchIdExisting) {
        await this.addToProcessQueue(batchIdExisting);
      }
      throw new Error(
        'Todos os processos já existem no banco de dados. Nenhum processo novo foi encontrado.',
      );
    }

    console.log(`✓ ${newProcesses.length} processos novos serão importados`);

    // Criar o lote (cabeçalho)
    const batch = await this.batchRepository.save({
      system: headerInfo.system === 'SAJ' ? 'ESAJ' : system.toUpperCase(),
      state: state,
      processDate: headerInfo.processDate,
      description: headerInfo.description,
      totalProcesses: newProcesses.length,
      processedCount: 0,
      processed: false,
    });

    console.log(`9. Lote criado com ID: ${batch.id}`);

    // Criar o status inicial do lote
    if (this.batchStatusRepository) {
      await this.batchStatusRepository.save({
        batch: batch,
        batchId: batch.id,
        status: 'processing',
        startedAt: new Date(),
        finishedAt: null,
        error: null,
      });
      console.log('Status do lote inicializado como processing.');
    }

    // Inserir processos em lotes de 500 para melhor performance
    const batchSize = 500;
    for (let i = 0; i < newProcesses.length; i += batchSize) {
      const chunk = newProcesses.slice(i, i + batchSize);
      const processesToInsert = chunk.map((p) => ({
        batchId: batch.id,
        comarca: p.comarca,
        foro: p.foro,
        vara: p.vara,
        classe: p.classe,
        processo: p.processo,
        valor: undefined,
        requerido: undefined,
        processed: false,
        errorCount: 0,
      }));

      await this.processRepository.save(processesToInsert);

      if (
        (i + batchSize) % 5000 === 0 ||
        i + batchSize >= newProcesses.length
      ) {
        console.log(
          `   Salvos ${Math.min(i + batchSize, newProcesses.length)}/${newProcesses.length} processos...`,
        );
      }
    }

    console.log('10. Todos os processos foram salvos no banco de dados!');

    await this.addToProcessQueue(batch.id);

    return {
      batchId: batch.id,
      totalProcesses: newProcesses.length,
      duplicatesIgnored: duplicateCount,
      system: system,
      state: state,
    };
  }

  public async exportProcessToExcel(
    batchId: number,
  ): Promise<ExportProcessExcelResult> {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      throw new BadRequestException(`Lote com ID ${batchId} não encontrado`);
    }

    const processes = await this.processRepository.find({
      where: { batchId },
      order: { id: 'ASC' },
    });

    if (processes.length === 0) {
      throw new BadRequestException(
        `Nenhum processo encontrado no lote ${batchId}`,
      );
    }

    const excelData = processes.map((p) => ({
      Processo: p.processo,
      Comarca: p.comarca,
      Foro: p.foro,
      Vara: p.vara,
      Classe: p.classe,
      Valor: p.valor,
      Requerido: p.requerido,
      Status: p.processed ? 'Processado' : 'Pendente',
    }));

    // Criar a worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Ajustar larguras das colunas
    const columnWidths = [
      { wch: 30 }, // Processo
      { wch: 25 }, // Comarca
      { wch: 30 }, // Foro
      { wch: 40 }, // Vara
      { wch: 30 }, // Classe
      { wch: 20 }, // Valor
      { wch: 50 }, // Requerido
      { wch: 12 }, // Status
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

    console.log(`Arquivo Excel criado: ${filePath}`);

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

  public async listAllBatches(system?: string): Promise<ProcessBatchEntity[]> {
    if (system) {
      return this.batchRepository.find({
        where: { system },
        order: { id: 'DESC' },
      });
    }

    return this.batchRepository.find({ order: { id: 'DESC' } });
  }

  private async processPdfToArray(
    pdfBuffer: Express.Multer.File['buffer'],
  ): Promise<{
    header: IProcessHeader;
    processes: IProcess[];
  }> {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    console.log('1. Verificando buffer...');
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('O Buffer do PDF está vazio.');
    }

    console.log('2. Criando Uint8Array...');
    const pdfDataArray = new Uint8Array(pdfBuffer);

    console.log('3. Carregando documento PDF...');
    const loadingTask = pdfjsLib.getDocument({
      data: pdfDataArray,
      useSystemFonts: true,
      disableFontFace: false,
      standardFontDataUrl: undefined,
    });

    console.log('4. Aguardando promise do documento...');
    const pdfDocument = await loadingTask.promise;
    console.log('5. PDF carregado! Total de páginas:', pdfDocument.numPages);

    const pdfProcessTable: IProcess[] = [];

    const { items } = await pdfDocument
      .getPage(1)
      .then((page) => page.getTextContent());

    const textItems = items.filter(this.isTextItem);

    const headerInfo = this.getHeaderInfoFromPDFArray(textItems);

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      if (i % 100 === 0) {
        console.log(`Processando página ${i}/${pdfDocument.numPages}...`);
      }

      const page = await pdfDocument.getPage(i);
      const itemContent = (await page.getTextContent()).items;

      const arrayData = this.getDataByPDFArray(itemContent as TextItem[]);

      console.log(arrayData.length, 'processos encontrados na página', i);

      pdfProcessTable.push(...arrayData);

      page.cleanup();
    }

    console.log('6. Total de processos encontrados:', pdfProcessTable.length);

    // Remover duplicados dentro do próprio array (mesmo processo em páginas diferentes)
    console.log('7. Removendo duplicados internos do PDF...');
    const uniqueProcessMap = new Map();

    pdfProcessTable.forEach((p) => {
      if (!uniqueProcessMap.has(p.processo)) {
        uniqueProcessMap.set(p.processo, p);
      }
    });

    const uniqueProcessData: IProcess[] = Array.from(
      uniqueProcessMap.values(),
    ) as IProcess[];
    const internalDuplicates =
      pdfProcessTable.length - uniqueProcessData.length;

    if (internalDuplicates > 0) {
      console.log(
        `   ⚠️  ${internalDuplicates} processos duplicados removidos do PDF`,
      );
    }
    console.log(`   ✓ ${uniqueProcessData.length} processos únicos no PDF`);

    return {
      header: headerInfo,
      processes: uniqueProcessData,
    };
  }

  private getHeaderInfoFromPDFArray(arrayPageOne: TextItem[]): IProcessHeader {
    const header = arrayPageOne.findIndex((item) => item.str === 'Comarca');

    const headerInfoText = arrayPageOne
      .slice(0, header - 1)
      .map((item) => item.str)
      .join(' ');

    const regex =
      /Processos\s+distribuídos\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sistema\s+([A-Za-z0-9_-]+)/i;

    const match = headerInfoText.match(regex);

    if (match) {
      try {
        const distibutedProcessesDateStr = match[1];
        const distibutedProcessesDate = UtilityClass.parseDate(
          distibutedProcessesDateStr,
        );
        const distributedProcessesSystem = match[2];

        console.log('Data do processo:', distibutedProcessesDate);
        console.log('Sistema do processo:', distributedProcessesSystem);

        return {
          processDate: distibutedProcessesDate,
          system: distributedProcessesSystem,
          description: headerInfoText.replace(/\s+/g, ' '),
        };
      } catch (error) {
        console.log('Erro ao analisar informações do cabeçalho:', error);
        throw new BadRequestException(
          'Erro ao converter dados do cabeçalho do PDF.',
        );
      }
    } else {
      throw new BadRequestException('Cabeçalho do PDF inválido');
    }
  }

  protected abstract getDataByPDFArray(array: TextItem[]): IProcess[];

  protected getcompleteStrFromPosition(
    array: TextItem[],
    x: number,
    y: number,
  ): string {
    let index = array.findIndex(
      (arr) =>
        arr.transform[4] === x && arr.transform[5] === y && arr.height !== 0,
    );
    let value = array[index];

    if (!value) return '';

    let text: string = value.str;

    while (value.hasEOL) {
      index++;
      value = array[index];
      text += value ? ` ${value.str}` : '';
    }

    return text;
  }

  private async fetchData(url: string) {
    const response = await lastValueFrom(
      this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          ...this.getExtraHeaders(),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
        },
        maxRedirects: 10,
        timeout: 15000,
        validateStatus: null,
        proxy: false,
      }),
    );

    const buffer = Buffer.from(response.data);
    const html = iconv.decode(buffer, 'latin1');

    return this.getDataFromHTML(html);
  }

  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  private isTextItem(this: void, obj: unknown): obj is TextItem {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'str' in obj &&
      typeof (obj as any).str === 'string'
    );
  }
}
