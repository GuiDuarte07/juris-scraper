import * as cheerio from 'cheerio';
import { Injectable } from '@nestjs/common';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { IProcess } from './../process/DTOs/ProcessDTO';
import {
  BaseProcessService,
  HtmlDataReturnType,
} from 'src/common/base/base_process.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class EsajService extends BaseProcessService {
  constructor(
    protected readonly httpService: HttpService,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    protected readonly batchStatusRepository: Repository<BatchProcessStatusEntity>,
    @InjectQueue('esaj-process-queue') private readonly esajQueue: Queue,
  ) {
    super(
      httpService,
      batchRepository,
      processRepository,
      batchStatusRepository,
    );
  }

  protected getExtraHeaders(): Record<string, string> | null {
    return null;
  }

  public getUrl = (lawSuitNumber: string) => {
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

  public getDataByPDFArray(array: TextItem[]) {
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

  public getDataFromHTML(html: string): HtmlDataReturnType {
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
  }

  public getBatchStatus(batchId: number) {
    return this.batchStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.batch', 'batch')
      .where('status.batchId = :batchId', { batchId })
      .andWhere('batch.system = :system', { system: 'ESAJ' })
      .getOne();
  }

  public listProcessingBatches() {
    return this.batchStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.batch', 'batch')
      .where('status.status = :status', { status: 'processing' })
      .andWhere('batch.system = :system', { system: 'ESAJ' })
      .getMany();
  }

  protected async addToProcessQueue(batchId: number): Promise<void> {
    await this.esajQueue.add({ batchId });
  }
}
