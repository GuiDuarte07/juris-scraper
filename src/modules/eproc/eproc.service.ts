import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { IProcess } from '../process/DTOs/ProcessDTO';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class EprocService {
  constructor(
    @InjectRepository(ProcessBatchEntity)
    private readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
  ) {}

  private PHPSESSID: string | null = 'oq5us2qpp13aaidehca2k11jvc';

  public getDataFromHTML(
    html: string,
    asNumber: boolean,
  ):
    | {
        reqdo: string;
        value: number;
      }
    | {
        reqdo: string;
        value: string;
      } {
    const $ = cheerio.load(html);

    const excesaoDiv = $('#divInfraExcecao');

    if (excesaoDiv.text().includes('Processo não encontrado.')) {
      return {
        reqdo: 'Processo não encontrado',
        value: 0,
      };
    }

    if (excesaoDiv.length > 0) {
      throw new Error('Exceção encontrada no HTML retornado');
    }

    const tds = $('#fldInformacoesAdicionais td');
    //const value = tds[1]?.children?.[0]?.children?.[0]?.data?.trim?.();

    if (
      !tds.eq(1) ||
      tds.eq(1).length === 0 ||
      tds.eq(1).text().trim() === ''
    ) {
      throw new Error('Dados não encontrados no HTML retornado');
    }

    const value = tds.eq(1).children().eq(0).children().eq(0).text().trim();

    if (value === '') {
      throw new Error('Valor da causa não encontrado no HTML retornado');
    }

    //const value = tds.eq(1).text().trim();

    const reu = $('#fldPartes table tr').eq(1).find('td').eq(1).text().trim();

    let numericValue = 0;
    if (typeof value === 'string') {
      numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    }

    if (asNumber) {
      return {
        reqdo: reu || 'Requerido não encontrado',
        value: numericValue || 0,
      };
    } else {
      const formattedValue = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(numericValue);

      return {
        reqdo: reu || 'Requerido não encontrado',
        value: formattedValue,
      };
    }
  }

  getEprocUrl = (lawSuitNumber: string) => {
    const url = new URL(
      'https://eproc1g-consulta.tjsp.jus.br/eproc/externo_controlador.php',
    );

    url.searchParams.set('acao', 'processo_seleciona_publica');
    url.searchParams.set('acao_origem', 'processo_seleciona_publica');
    url.searchParams.set('acao_retorno', 'processo_consulta_publica');
    url.searchParams.set('num_processo', lawSuitNumber);
    url.searchParams.set('num_chave', '');
    url.searchParams.set('num_chave_documento', '');

    return url.toString();
  };

  public async eprocScrapeLawSuit(lawSuitNumber: string, asNumber: boolean) {
    const url = this.getEprocUrl(lawSuitNumber);

    const response = await fetch(url, {
      headers: {
        Cookie: `PHPSESSID=${this.PHPSESSID}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow', // segue redirects automaticamente
    });

    // Para ver o HTML da resposta
    const buffer = await response.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), 'latin1'); // ou 'windows-1252'

    return this.getDataFromHTML(html, asNumber);
  }

  public async importPdfToDatabase(
    pdfBuffer: Express.Multer.File['buffer'],
    system = 'EPROC',
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

  public updateSessionId(sessionId: string) {
    this.PHPSESSID = sessionId;
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
}
