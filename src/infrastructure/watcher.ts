import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { logger } from './logger';
import { FileProcessor } from '@application/FileProcessor';
import { ClientSQLRepository } from './sqlserver/ClientSQLRepository';

const BASE_DIR = process.env.WATCH_DIR || './uploads';
const PROCESS_DIR = path.join(BASE_DIR, 'process');
const PROCESSING_DIR = path.join(BASE_DIR, 'processing');
const PROCESSED_DIR = path.join(BASE_DIR, 'processed');
const ERROR_DIR = path.join(BASE_DIR, 'error');

let processing = false;
const queue: string[] = [];

export function startWatcher() {
  (async () => {
    try {
      await Promise.all(
        [PROCESS_DIR, PROCESSING_DIR, PROCESSED_DIR, ERROR_DIR]
          .map(dir => fsPromises.mkdir(dir, { recursive: true }))
      );
      logger.info(`Watcher initialized at ${PROCESS_DIR}`);
    } catch (err) {
      logger.error('Error creating watcher dirs:', err);
      return;
    }

    const repo = new ClientSQLRepository();
    const useCase = new FileProcessor(repo);

    fs.watch(PROCESS_DIR, (eventType: string, filename: string | Buffer | null) => {
      if (!filename) return;
      const name = filename.toString();
      if (
        !name.startsWith('CLIENTS_IN_') ||
        !name.endsWith('.dat')
      ) return;

      const filePath = path.join(PROCESS_DIR, name);

      (async () => {
        try {
          await fsPromises.stat(filePath);
        } catch {
          return;
        }

        if (!queue.includes(filePath)) {
          logger.info(`File detected: ${name}`);
          queue.push(filePath);
          processNext();
        }
      })();
    });

    async function processNext() {
      if (processing || queue.length === 0) return;

      const currentFile = queue.shift()!;
      processing = true;

      try {
        await useCase.execute(currentFile);
        logger.info(`Processing finished: ${path.basename(currentFile)}`);
      } catch (err) {
        logger.error(`Error processing ${path.basename(currentFile)}`, err);
      } finally {
        processing = false;
        processNext();
      }
    }
  })();
}
