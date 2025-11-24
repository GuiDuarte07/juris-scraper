import { HtmlDataReturnType } from 'src/common/base/base_process.service';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessEntity } from 'src/Entities/Process.entity';
import { ProcessBatchEntity } from 'src/Entities/ProcessBatch.entity';
import pLimit from 'p-limit';

@Injectable()
export abstract class BaseWorkerService implements OnModuleInit {
  protected abstract readonly logger: Logger;
  protected abstract readonly system: string;

  protected isProcessing = false;
  protected baseBatchDelay = 2000;
  protected currentBatchDelay = this.baseBatchDelay;
  protected consecutiveErrors = 0;
  protected readonly MAX_BATCH_DELAY = 15000;
  protected readonly CONCURRENT_REQUESTS = 3;
  //abstract protected baseProcessService: BaseProcessService;

  constructor(
    @InjectRepository(ProcessEntity)
    protected readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ProcessBatchEntity)
    protected readonly batchRepository: Repository<ProcessBatchEntity>,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 Worker de processamento iniciado!');
    this.logger.log(
      `Paralelização: ${this.CONCURRENT_REQUESTS} requisições simultâneas por lote`,
    );
    this.logger.log(
      `Delay entre lotes: ~${Math.round(this.baseBatchDelay / 1000)}s (com variação aleatória)`,
    );
    await this.processNextBatch();
    setInterval(() => {
      void this.processNextBatch();
    }, 30000);
  }

  protected abstract processLawSuit(
    process: ProcessEntity,
  ): Promise<HtmlDataReturnType | null>;

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomDelay(base: number) {
    const variance = base * 0.3;
    return base + (Math.random() * variance * 2 - variance);
  }

  protected async processNextBatch() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const unprocessedProcesses = await this.processRepository
        .createQueryBuilder('process')
        .innerJoinAndSelect('process.batch', 'batch')
        .where('process.processed = :processed', { processed: false })
        .andWhere('batch.system = :system', { system: this.system })
        .orderBy('process.id', 'ASC')
        .take(100)
        .getMany();

      if (unprocessedProcesses.length === 0) {
        this.logger.log('Nenhum processo pendente. Aguardando 30 segundos...');
        this.isProcessing = false;
        return;
      }

      this.logger.log(
        `Processando lote de ${unprocessedProcesses.length} processos...`,
      );
      let successCount = 0;
      let errorCount = 0;

      for (
        let i = 0;
        i < unprocessedProcesses.length;
        i += this.CONCURRENT_REQUESTS
      ) {
        const batch = unprocessedProcesses.slice(
          i,
          i + this.CONCURRENT_REQUESTS,
        );
        const limit = pLimit(this.CONCURRENT_REQUESTS);

        const results = await Promise.allSettled(
          batch.map((process) =>
            limit(async () => {
              try {
                const data = await this.processLawSuit(process);

                if (data == null) {
                  this.logger.error(
                    `Retorno nulo do processo ${process.processo}`,
                  );
                  return {
                    success: false,
                    process,
                  };
                }

                process.valor = data.value;
                process.requerido = data.reqdo;
                process.processed = true;

                await this.processRepository.save(process);

                this.consecutiveErrors = 0;

                return { success: true, process };
              } catch (err) {
                const errorMessage =
                  err instanceof Error ? err.message : String(err);

                this.consecutiveErrors++;

                process.errorCount = (process.errorCount || 0) + 1;

                process.lastError = errorMessage;

                await this.processRepository.save(process);
                this.logger.error(
                  `Erro ao processar ${process.processo}: ${errorMessage}`,
                );

                if (process.errorCount >= 5) {
                  this.logger.warn(
                    `Processo ${process.processo} falhou ${process.errorCount} vezes. Marcando como processado.`,
                  );

                  process.processed = true;
                  process.valor = 0;
                  process.requerido = 'ERRO_MÚLTIPLAS_TENTATIVAS';
                  await this.processRepository.save(process);
                }
                return { success: false, process, errorMessage };
              }
            }),
          ),
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success)
            successCount++;
          else errorCount++;
        });

        // Adaptar delay baseado em erros
        if (this.consecutiveErrors >= 5) {
          this.currentBatchDelay = Math.min(
            this.MAX_BATCH_DELAY,
            this.currentBatchDelay + 2000,
          );
          this.logger.warn(
            `Muitos erros consecutivos (${this.consecutiveErrors}). Aumentando delay para ${Math.round(this.currentBatchDelay / 1000)}s`,
          );
        } else if (
          this.consecutiveErrors === 0 &&
          this.currentBatchDelay > this.baseBatchDelay
        ) {
          this.currentBatchDelay = Math.max(
            this.baseBatchDelay,
            this.currentBatchDelay - 1000,
          );
        }

        const processed = i + batch.length;
        this.logger.log(
          `${processed}/${unprocessedProcesses.length} - Sucesso: ${successCount}, Erros: ${errorCount}`,
        );

        if (i + this.CONCURRENT_REQUESTS < unprocessedProcesses.length) {
          const delay = this.getRandomDelay(this.currentBatchDelay);
          await this.sleep(delay);
        }
      }

      this.logger.log(
        `✓ Lote finalizado! Sucesso: ${successCount}, Erros: ${errorCount}`,
      );

      // Atualizar contadores dos lotes
      const processedBatchIds = [
        ...new Set(unprocessedProcesses.map((p) => p.batchId)),
      ];
      for (const batchId of processedBatchIds) {
        const totalInBatch = await this.processRepository.count({
          where: { batchId },
        });

        const processedInBatch = await this.processRepository.count({
          where: { batchId, processed: true },
        });
        await this.batchRepository.update(batchId, {
          processedCount: processedInBatch,
          processed: processedInBatch === totalInBatch,
        });
      }
    } catch (error) {
      this.logger.error('Erro no processamento do lote:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  public async getProcessingStatus() {
    const totalProcesses = await this.processRepository.count();
    const processedProcesses = await this.processRepository.count({
      where: { processed: true },
    });
    const pendingProcesses = totalProcesses - processedProcesses;
    const errorProcesses = await this.processRepository.count({
      where: { processed: false, errorCount: 5 },
    });
    const batches = await this.batchRepository.find();

    return {
      totalProcesses,
      processedProcesses,
      pendingProcesses,
      errorProcesses,
      percentComplete:
        totalProcesses > 0
          ? ((processedProcesses / totalProcesses) * 100).toFixed(2)
          : 0,
      batches: batches.length,
      currentBatchDelay: Math.round(this.currentBatchDelay / 1000),
      consecutiveErrors: this.consecutiveErrors,
      concurrentRequests: this.CONCURRENT_REQUESTS,
    };
  }
}
