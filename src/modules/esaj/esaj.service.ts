import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { Injectable } from '@nestjs/common';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { IProcess } from './../process/DTOs/ProcessDTO';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

type TResult = { reqdo: string; value: string | number };

@Injectable()
export class EsajService {
  constructor(
    @InjectRepository(ProcessBatchEntity)
    private readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
  ) {}

  public getEsajUrl = (lawSuitNumber: string) => {
    const lawSuitParts = lawSuitNumber.split('.');
    const numeroDigitoAnoUnificado = lawSuitParts.slice(0, 2).join('.');
    const foroNumeroUnificado = lawSuitParts[2];

    const url = new URL('https://esaj.tjsp.jus.br/cpopg/search.do');

    url.searchParams.set('cbPesquisa', 'NUMPROC');
    url.searchParams.set('numeroDigitoAnoUnificado', numeroDigitoAnoUnificado);
    url.searchParams.set('foroNumeroUnificado', foroNumeroUnificado);
    url.searchParams.set(
      'dadosConsulta.valorConsultaNuUnificado',
      lawSuitNumber,
    );
    url.searchParams.set('dadosConsulta.tipoNuProcesso', 'UNIFICADO');

    return url.toString();
  };

  public async esajScrapeLawSuit(
    lawSuitNumber: string,
    asNumber: boolean,
  ): Promise<TResult | null> {
    try {
      const url = this.getEsajUrl(lawSuitNumber);

      let result: TResult | null = null;

      for (let tries = 0; tries <= 2; tries++) {
        await this.sleep(tries * 1000);

        if (result && result.reqdo === 'REPROCESSAR') {
          console.log(lawSuitNumber + ' - Não processou ' + tries);
        }

        result = await this.fetchData(url, asNumber);

        if (!(result.reqdo === 'REPROCESSAR' && result.value === 0)) {
          break;
        }
      }

      return result;
    } catch (err) {
      throw new Error(err);
    }
  }

  public async importPdfToDatabase(
    pdfBuffer: Express.Multer.File['buffer'],
    system = 'ESAJ',
    state = 'SP',
  ) {
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

    const processData: IProcess[] = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      if (i % 100 === 0) {
        console.log(`Processando página ${i}/${pdfDocument.numPages}...`);
      }

      const page = await pdfDocument.getPage(i);
      const itemContent = (await page.getTextContent()).items;

      const arrayData = this.corrigirArray(itemContent as TextItem[]);
      processData.push(...arrayData);

      page.cleanup();
    }

    console.log('6. Total de processos encontrados:', processData.length);

    // Remover duplicados dentro do próprio array (mesmo processo em páginas diferentes)
    console.log('7. Removendo duplicados internos do PDF...');
    const uniqueProcessMap = new Map();
    processData.forEach((p) => {
      if (!uniqueProcessMap.has(p.processo)) {
        uniqueProcessMap.set(p.processo, p);
      }
    });
    const uniqueProcessData: IProcess[] = Array.from(
      uniqueProcessMap.values(),
    ) as IProcess[];
    const internalDuplicates = processData.length - uniqueProcessData.length;

    if (internalDuplicates > 0) {
      console.log(
        `   ⚠️  ${internalDuplicates} processos duplicados removidos do PDF`,
      );
    }
    console.log(`   ✓ ${uniqueProcessData.length} processos únicos no PDF`);

    // Salvar no banco de dados
    console.log('8. Verificando processos que já existem no banco...');

    // Verificar quais processos já existem no banco
    const processNumbers = uniqueProcessData.map((p) => p.processo);

    const existingProcesses = await this.processRepository
      .createQueryBuilder('process')
      .select('process.processo')
      .where('process.processo IN (:...processNumbers)', { processNumbers })
      .getMany();

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
      throw new Error(
        'Todos os processos já existem no banco de dados. Nenhum processo novo foi encontrado.',
      );
    }

    console.log(`   ✓ ${newProcesses.length} processos novos serão importados`);

    // Criar o lote (cabeçalho)
    const batch = await this.batchRepository.save({
      system: system,
      state: state,
      processDate: new Date(),
      totalProcesses: newProcesses.length,
      processedCount: 0,
      processed: false,
    });

    console.log(`9. Lote criado com ID: ${batch.id}`);

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

    return {
      batchId: batch.id,
      totalProcesses: newProcesses.length,
      duplicatesIgnored: duplicateCount,
      internalDuplicatesRemoved: internalDuplicates,
      system: system,
      state: state,
    };
  }

  private corrigirArray(array: TextItem[]) {
    //const header = array.indexOf('Comarca');
    const header = array.findIndex((item) => item.str === 'Comarca');
    const withoutHeader = header !== -1 ? array.slice(header + 10) : array;

    const comarcaX = 74.016;
    const foroX = 187.272;
    const varaX = 309.528;
    const classeX = 583.992;

    const processCNJ = withoutHeader
      .filter((item) => this.regexCNJ.test(item.str))
      .map((item) => ({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
      }));

    const processData: IProcess[] = [];

    processCNJ.forEach((item) => {
      processData.push({
        comarca: this.getcompleteStrFromPosition(array, comarcaX, item.y),
        foro: this.getcompleteStrFromPosition(array, foroX, item.y),
        vara: this.getcompleteStrFromPosition(array, varaX, item.y),
        classe: this.getcompleteStrFromPosition(array, classeX, item.y),
        processo: item.str,
      });
    });

    return processData;
  }

  private regexCNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

  private getcompleteStrFromPosition(
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

  private async fetchData(url: string, asNumber: boolean) {
    const response = await (axios as AxiosInstance).get<string>(url, {
      headers: {
        'User-Agent': this.getRandomUserAgent(),
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
    });

    const html: string = response.data;
    return this.getDataFromHTML(html, asNumber);
  }

  private getDataFromHTML(html: string, asNumber: boolean): TResult {
    const $ = cheerio.load(html);

    if ($('#PRECATORIA').length > 0) {
      return {
        reqdo: 'REPROCESSAR',
        value: 0,
      };
    }

    const reqdo = $('.nomeParteEAdvogado').eq(1).text().trim();

    let value: string | number = $('#valorAcaoProcesso').text();

    if (value) {
      value = value
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (asNumber) {
      value = parseFloat(
        value
          .replace('R$', '') // remove R$
          .replace(/\./g, '') // remove pontos
          .replace(',', '.') // troca vírgula decimal por ponto
          .trim(),
      );

      return {
        reqdo: reqdo || 'Requerido não encontrado',
        value: value || 0,
      };
    } else {
      return {
        reqdo: reqdo || 'Requerido não encontrado',
        value: value || 0,
      };
    }
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
}
