import { BadRequestException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import {
  BaseProcessService,
  HtmlDataReturnType,
} from 'src/common/base/base_process.service';
import { IProcess } from '../process/DTOs/ProcessDTO';
import { Repository } from 'typeorm';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceSessionEntity } from 'src/Entities/ServiceSession.entity';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { BatchProcessStatusEntity } from 'src/Entities/BatchProcessStatus.entity';
import { HttpService } from '@nestjs/axios';
import { setupEprocInterceptor } from 'src/interceptors/eproc.interceptor';

@Injectable()
export class EprocService extends BaseProcessService {
  constructor(
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ServiceSessionEntity)
    private readonly serviceSessionRepository: Repository<ServiceSessionEntity>,
    @InjectRepository(BatchProcessStatusEntity)
    protected readonly batchStatusRepository: Repository<BatchProcessStatusEntity>,
    @InjectQueue('eproc-process-queue') private readonly eprocQueue: Queue,
  ) {
    const httpService = new HttpService();

    super(
      httpService,
      batchRepository,
      processRepository,
      batchStatusRepository,
    );

    setupEprocInterceptor(this)(httpService.axiosRef);
  }

  protected getExtraHeaders(): Record<string, string> | null {
    return {
      Cookie: `PHPSESSID=${this.PHPSESSID}`,
    };
  }

  private PHPSESSID: string | null = 'oq5us2qpp13aaidehca2k11jvc';
  private sessionExpiresAt: Date | null = null;

  public getDataFromHTML(html: string): HtmlDataReturnType {
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

    if (
      !tds.eq(1) ||
      tds.eq(1).length === 0 ||
      tds.eq(1).text().trim() === ''
    ) {
      throw new BadRequestException('Dados não encontrados no HTML retornado');
    }

    const value = tds.eq(1).children().eq(0).children().eq(0).text().trim();

    if (value === '') {
      throw new BadRequestException(
        'Valor da causa não encontrado no HTML retornado',
      );
    }

    const reu = $('#fldPartes table tr').eq(1).find('td').eq(1).text().trim();

    let numericValue = 0;
    if (typeof value === 'string') {
      numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    }

    return {
      reqdo: reu || 'Requerido não encontrado',
      value: numericValue || 0,
    };
  }
  getUrl = (lawSuitNumber: string) => {
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

  protected getDataByPDFArray(array: TextItem[]) {
    const HEADER_OFFSET = 8;

    const header = array.findIndex((item) => item.str === 'Comarca');
    const withoutHeader =
      header !== -1 ? array.slice(header + HEADER_OFFSET) : array;

    const comarcaX = 74.016;
    const varaX = 191.736;
    const processX = 389.736;
    const classeX = 503.784;

    //this.regexCNJ.test;
    const getProcessCNJByXPosition = withoutHeader.filter(
      (item) => item.transform[4] === processX,
    );

    let processCNJ: { str: string; x: number; y: number }[] = [];

    // Verifica se todos os itens encontrados na posição X são de uma só linha
    const proccesEOL: boolean = getProcessCNJByXPosition.every(
      (item) => this.regexCNJ.test(item.str) === true,
    );

    if (proccesEOL) {
      processCNJ = getProcessCNJByXPosition.map((item) => ({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
      }));
    } else {
      for (let i = 0; i < getProcessCNJByXPosition.length; i++) {
        const atualProcessCNJ = getProcessCNJByXPosition[i];

        if (atualProcessCNJ.hasEOL) {
          processCNJ.push({
            str: this.getcompleteStrFromPosition(
              getProcessCNJByXPosition,
              processX,
              getProcessCNJByXPosition[i].transform[5] as number,
            ).replace(/\s+/g, ''),
            x: atualProcessCNJ.transform[4] as number,
            y: atualProcessCNJ.transform[5] as number,
          });
        }
      }
    }

    if (processCNJ.length === 0) {
      console.log('Nenhum processo encontrado nesta página.');
      throw new BadRequestException('Nenhum processo encontrado no PDF.');
    }

    const processData: IProcess[] = [];

    processCNJ.forEach((item) => {
      processData.push({
        comarca: this.getcompleteStrFromPosition(array, comarcaX, item.y),
        foro: '',
        vara: this.getcompleteStrFromPosition(array, varaX, item.y),
        classe: this.getcompleteStrFromPosition(array, classeX, item.y),
        processo: item.str,
      });
    });

    return processData;
  }

  public async updateSessionId(sessionId: string) {
    const expiresAt = new Date(Date.now() + 22 * 60 * 60 * 1000);

    let existing = await this.serviceSessionRepository.findOne({
      where: { service_name: 'eproc' },
    });

    if (existing) {
      this.serviceSessionRepository.merge(existing, {
        session_id: sessionId,
        expires_at: expiresAt,
      });
    } else {
      existing = this.serviceSessionRepository.create({
        service_name: 'eproc',
        session_id: sessionId,
        expires_at: expiresAt,
      });
    }

    // Atualiza cache em memória
    this.PHPSESSID = sessionId;
    this.sessionExpiresAt = expiresAt;

    await this.serviceSessionRepository.save(existing);

    return {
      sessionId: sessionId,
      expiresAt,
    };
  }

  public async getSessionId() {
    if (
      this.PHPSESSID &&
      this.sessionExpiresAt &&
      this.isSessionExpired(this.sessionExpiresAt)
    )
      return this.PHPSESSID;

    const session = await this.serviceSessionRepository.findOne({
      where: { service_name: 'eproc' },
    });

    if (!session) {
      throw new BadRequestException('Sessão PHPSESSID não encontrada');
    }

    if (this.isSessionExpired(session.expires_at)) {
      throw new BadRequestException('Sessão PHPSESSID expirada');
    }

    this.PHPSESSID = session.session_id;
    this.sessionExpiresAt = session.expires_at;
    return this.PHPSESSID;
  }

  public getBatchStatus(batchId: number) {
    return this.batchStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.batch', 'batch')
      .where('status.batchId = :batchId', { batchId })
      .andWhere('batch.system = :system', { system: 'EPROC' })
      .getOne();
  }

  public listProcessingBatches() {
    return this.batchStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.batch', 'batch')
      .where('status.status = :status', { status: 'processing' })
      .andWhere('batch.system = :system', { system: 'EPROC' })
      .getMany();
  }

  private isSessionExpired(expires: Date): boolean {
    if (!expires) return true;
    return expires.getTime() <= Date.now();
  }

  protected async addToProcessQueue(batchId: number): Promise<void> {
    await this.eprocQueue.add({ batchId });
  }
}
