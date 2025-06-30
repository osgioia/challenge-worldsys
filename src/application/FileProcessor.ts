import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { parse } from 'csv-parse';
import { logger } from '@infrastructure/logger';
import { ClientRepository } from '@domain/ClientRepository';
import { Client } from '@domain/Client';

export interface ProcessingStats {
  totalLines: number;
  processed: number;
  errors: number;
  duplicates: number;
  errorDetails: Array<{ line: number; content: string; errors: string[] }>;
  omittedErrors: number;
  memoryStats: {
    maxMemoryUsed: number;
    avgWorkers: number;
    gcInvocations: number;
  };
}

export class FileProcessor {
  private maxMemoryUsed: number = 0;
  private readonly MAX_ERRORS_IN_MEMORY: number;
  private readonly CHUNK_SIZE = 100;

  constructor(
    private clientRepo: ClientRepository, 
    maxErrorsInMemory: number = 1000
  ) {
    this.MAX_ERRORS_IN_MEMORY = maxErrorsInMemory;
  }

  async execute(filePath: string): Promise<ProcessingStats> {
    const name = path.basename(filePath);
    const procDir = './uploads/processing';
    const doneDir = './uploads/processed';

    const stats: ProcessingStats = {
      totalLines: 0,
      processed: 0,
      errors: 0,
      duplicates: 0,
      errorDetails: [],
      omittedErrors: 0,
      memoryStats: {
        maxMemoryUsed: 0,
        avgWorkers: 0,
        gcInvocations: 0
      }
    };

    try {
      const procPath = path.join(procDir, name);
      await fs.rename(filePath, procPath);
      logger.info(`File moved to processing: ${name}. ChunkSize: ${this.CHUNK_SIZE}`);

      const source = createReadStream(procPath).pipe(parse({ delimiter: '|', trim: true, skip_empty_lines: true }));
      const self = this;

      await pipeline(
        source,
        async function* (source) {
          let chunk: string[] = [];
          let totalLines = 0;

          for await (const cols of source) {
            totalLines++;
            chunk.push(cols.join('|'));

            if (chunk.length >= self.CHUNK_SIZE) {
              await self.processChunkAsync(chunk, name, stats);
              chunk = [];
            }
          }

          if (chunk.length > 0) {
            logger.info(`[Loop] Processing final chunk of size ${chunk.length}`);
            await self.processChunkAsync(chunk, name, stats);
            logger.info(`[Loop] Final chunk processed, cleaning chunk`);
            chunk = [];
          }
        }
      );

      const donePath = path.join(doneDir, name);
      await fs.rename(procPath, donePath);
      logger.info(`File processed and moved to processed: ${name}`);

    } catch (error) {
      logger.error('Error processing file:', error);
    }

    stats.memoryStats.maxMemoryUsed = this.maxMemoryUsed;
    stats.memoryStats.avgWorkers = 0;
    stats.memoryStats.gcInvocations = 0;

    return stats;
  }

  private async processChunkAsync(chunk: string[], name: string, stats: ProcessingStats) {
    const ids = chunk.map(line => line.split('|')[0]);
    let duplicateIds: string[] = [];
    try {
      duplicateIds = await this.clientRepo.existIds(ids);
    } catch (e) {
      duplicateIds = [];
    }

    const chunkWithoutDuplicates = chunk.filter(line => !duplicateIds.includes(line.split('|')[0]));
    const duplicates = chunk.length - chunkWithoutDuplicates.length;
    
    const valids: Client[] = [];
    const errors: Array<{ line: number; content: string; errors: string[] }> = [];
    chunkWithoutDuplicates.forEach((line, idx) => {
      const { client, errors: errs } = Client.createFromLine(line);
      if (client) {
        valids.push(client);
      } else {
        errors.push({ line: idx + 1, content: line, errors: errs });
      }
    });
    
    if (valids.length > 0) {
      try {
        await this.clientRepo.saveBatch(valids, name);
        } catch (e) {
        errors.push(...valids.map((v, idx) => ({ line: idx + 1, content: JSON.stringify(v), errors: ['Error saving to DB'] })));
      }
    } else {
      logger.info(`[Chunk] No valid records to save in this chunk. Duplicates: ${duplicates}, Errors: ${errors.length}`);
    }

    stats.processed += valids.length;
    stats.errors += errors.length;
    stats.duplicates += duplicates;
    await this.addErrorsWithLimit(stats, errors, name);

    chunk.length = 0;
    chunkWithoutDuplicates.length = 0;
    valids.length = 0;
    errors.length = 0;
  }

  private async addErrorsWithLimit(
    stats: ProcessingStats,
    newErrors: any[],
    fileName?: string
  ): Promise<void> {
    const errorsDir = './uploads/errors';
    const errorsFile = fileName
      ? path.join(errorsDir, `errors_${fileName}.log`)
      : path.join(errorsDir, 'generic_errors.log');

    await fs.mkdir(errorsDir, { recursive: true });

    for (const error of newErrors) {
      if (stats.errorDetails.length < this.MAX_ERRORS_IN_MEMORY) {
        stats.errorDetails.push(error);
      } else {
        const oldestError = stats.errorDetails.shift();
        if (oldestError) {
          await fs.appendFile(
            errorsFile,
            JSON.stringify(oldestError) + '\n',
            'utf8'
          );
        }
        stats.errorDetails.push(error);
        stats.omittedErrors++;
      }
    }
    if (stats.omittedErrors > 0 && stats.omittedErrors % 100 === 0) {
      logger.warn(
        `Error memory limit reached. ${stats.omittedErrors} errors replaced out of ${stats.errors} total. Keeping only the ${this.MAX_ERRORS_IN_MEMORY} most recent.`
      );
    }
  }
}
