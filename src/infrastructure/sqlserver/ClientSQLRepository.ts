import sql from 'mssql';
import { ClientRepository } from '@domain/ClientRepository';
import { Client } from '@domain/Client';
import { getPool } from '../db';
import { logger } from '../logger';
import { promises as fs } from 'fs';
import path from 'path';

async function saveLines(
  fileName: string,
  directory: string,
  lines: string[]
): Promise<void> {
  const baseDir = process.env.WATCH_DIR || 'uploads';
  const dirPath = path.join(baseDir, directory);
  await fs.mkdir(dirPath, { recursive: true });
  const content = lines.join('\n');
  await fs.writeFile(path.join(dirPath, fileName), content);
}

export class ClientSQLRepository implements ClientRepository {
  async save(client: Client): Promise<void> {
    if (!client.isValid()) {
      throw new Error(`Invalid client: ${client.id}`);
    }

    const pool = getPool();
    const request = pool.request();

    try {
      await request
        .input('id', sql.VarChar(50), client.id)
        .input('firstName', sql.VarChar(255), client.firstName)
        .input('lastName', sql.VarChar(255), client.lastName)
        .input('email', sql.VarChar(255), client.email)
        .input('age', sql.Int, client.age)
        .query(`
          MERGE Clients AS target
          USING (SELECT @id AS id, @firstName AS firstName, @lastName AS lastName,
                        @email AS email, @age AS age) AS source
          ON target.id = source.id
          WHEN MATCHED THEN
            UPDATE SET firstName = source.firstName,
                       lastName = source.lastName,
                       email = source.email,
                       age = source.age
          WHEN NOT MATCHED THEN
            INSERT (id, firstName, lastName, email, age)
            VALUES (source.id, source.firstName, source.lastName, source.email, source.age);
        `);

      logger.debug(`Client saved: ${client.id}`);
    } catch (error) {
      logger.error(`Error saving client ${client.id}:`, error);
      throw error;
    }
  }

  async saveBatch(clients: Client[], fileName: string): Promise<void> {
    const valids: Client[] = [];
    const invalids: { line: string; errors: string[] }[] = [];

    for (const client of clients) {
      const validation = client.isValid();
      if (validation.valid) {
        valids.push(client);
      } else {
        invalids.push({
          line: client.originalLine,
          errors: validation.errors,
        });
      }
    }

    const pool = getPool();
    const tvp = new sql.Table();
    tvp.columns.add('id', sql.VarChar(50));
    tvp.columns.add('firstName', sql.VarChar(255));
    tvp.columns.add('lastName', sql.VarChar(255));
    tvp.columns.add('email', sql.VarChar(255));
    tvp.columns.add('age', sql.Int);

    for (const client of valids) {
      tvp.rows.add(
        client.id,
        client.firstName,
        client.lastName,
        client.email,
        client.age
      );
    }

    const processed: string[] = valids.map((c) => c.originalLine);
    const errors: string[] = invalids.map((i) => i.line);

    try {
      if (tvp.rows.length > 0) {
        await pool
          .request()
          .input('Clients', tvp)
          .execute('sp_bulkInsertClients');
      }
    } catch (error) {
      logger.error('Error in bulk insert:', error);
      errors.push(...processed);
      processed.length = 0;
    }

    const tasks: Promise<void>[] = [];
    if (processed.length > 0) {
      tasks.push(saveLines(fileName, 'processed', processed));
    }
    if (errors.length > 0) {
      tasks.push(saveLines(fileName, 'error', errors));
    }
    await Promise.all(tasks);
  }

  async getById(id: string): Promise<Client | null> {
    const pool = getPool();
    const request = pool.request();

    try {
      const result = await request
        .input('id', sql.VarChar(50), id)
        .query('SELECT * FROM Clients WHERE id = @id');

      if (result.recordset.length === 0) return null;
      const r = result.recordset[0];
      return new Client(
        r.id,
        r.firstName,
        r.lastName,
        r.email,
        r.age,
        r.createdAt
      );
    } catch (error) {
      logger.error(`Error getting client ${id}:`, error);
      throw error;
    }
  }

  async getAll(): Promise<Client[]> {
    const pool = getPool();
    try {
      const result = await pool
        .request()
        .query('SELECT * FROM Clients ORDER BY createdAt DESC');
      return result.recordset.map(
        (r) =>
          new Client(
            r.id,
            r.firstName,
            r.lastName,
            r.email,
            r.age,
            r.createdAt
          )
      );
    } catch (error) {
      logger.error('Error getting all clients:', error);
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const pool = getPool();
    try {
      const result = await pool
        .request()
        .input('id', sql.VarChar(50), id)
        .query('SELECT COUNT(*) AS count FROM Clients WHERE id = @id');
      return result.recordset[0].count > 0;
    } catch (error) {
      logger.error(`Error checking client existence ${id}:`, error);
      throw error;
    }
  }

  async existIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    
    const pool = getPool();
    
    try {
      const request = pool.request();
      
      ids.forEach((id, index) => {
        request.input(`param${index}`, sql.VarChar(50), id);
      });
      
      const queryWithParams = `SELECT id FROM Clients WHERE id IN (${ids.map((_, index) => `@param${index}`).join(', ')})`;
      
      const result = await request.query(queryWithParams);
      return result.recordset.map((row: any) => row.id);
    } catch (error) {
      logger.error('Error checking existing ids:', error);
      throw error;
    }
  }
}