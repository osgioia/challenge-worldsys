import sql from 'mssql';
import { logger } from './logger';

const config: sql.config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'yourStrong(!)Password',
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ClientesDB',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000
  }
};

let pool: sql.ConnectionPool;

export async function connectDB(): Promise<void> {
  const maxRetries = 10;
  const retryDelay = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Intento de conexión ${attempt}/${maxRetries} a SQL Server...`);
      
      if (pool) {
        await pool.close();
      }
      
      const masterConfig = { ...config, database: 'master' };
      pool = new sql.ConnectionPool(masterConfig);
      
      pool.on('error', (err) => {
        logger.error('Error en el pool de conexiones:', err);
      });

      await pool.connect();
      
      const dbName = config.database || 'ClientesDB';
      const checkDbQuery = `
        IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${dbName}')
        BEGIN
            CREATE DATABASE [${dbName}];
            SELECT 'CREATED' as status;
        END
        ELSE
        BEGIN
            SELECT 'EXISTS' as status;
        END
      `;
      
      const dbCheckResult = await pool.request().query(checkDbQuery);
      const dbStatus = dbCheckResult.recordset[0].status;
      
      if (dbStatus === 'CREATED') {
        logger.info(`Base de datos '${dbName}' creada exitosamente`);
      } else {
        logger.info(`Base de datos '${dbName}' ya existe`);
      }
      
      await pool.close();
      
      pool = new sql.ConnectionPool(config);
      pool.on('error', (err) => {
        logger.error('Error en el pool de conexiones:', err);
      });
      
      await pool.connect();
      
      const result = await pool.request().query('SELECT DB_NAME() as database_name');
      logger.info(`Conectado exitosamente a SQL Server. Base de datos: ${result.recordset[0].database_name}`);
      return;
      
    } catch (error: any) {
      logger.error(`Error en intento ${attempt}/${maxRetries}:`, {
        message: error.message,
        code: error.code,
        server: config.server,
        database: config.database,
        user: config.user
      });

      if (attempt === maxRetries) {
        logger.error('Se agotaron todos los intentos de conexión');
        throw error;
      }

      const isRecoverableError = [
        'ESOCKET',
        'ELOGIN',
        'ETIMEOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'ENOTOPEN'
      ].includes(error.code);

      if (!isRecoverableError) {
        logger.error('Error no recoverable, cancelando reintentos');
        throw error;
      }

      logger.info(`Esperando ${retryDelay}ms antes del siguiente intento...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

export function getPool(): sql.ConnectionPool {
  if (!pool || !pool.connected) {
    throw new Error('Base de datos no conectada. Ejecuta connectDB() primero.');
  }
  return pool;
}

export async function closeDB(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
      logger.info('Conexión a la base de datos cerrada correctamente');
    } catch (error) {
      logger.error('Error cerrando la conexión:', error);
    }
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.request().query('SELECT 1 as test');
    return result.recordset[0].test === 1;
  } catch (error) {
    logger.error('Error en test de conexión:', error);
    return false;
  }
}