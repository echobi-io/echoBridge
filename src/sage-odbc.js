import { HttpError } from './errors.js';

export class SageOdbcClient {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.connectionPromise = undefined;
  }

  async connect() {
    if (!this.connectionPromise) {
      this.connectionPromise = this.#openConnection().catch((error) => {
        this.connectionPromise = undefined;
        throw error;
      });
    }

    return this.connectionPromise;
  }

  async #openConnection() {
    let odbc;

    try {
      ({ default: odbc } = await import('odbc'));
    } catch (error) {
      throw new HttpError(
        500,
        'odbc_not_installed',
        'The optional "odbc" package is not installed. Run "npm install" on the host where this service will access Sage 50c.',
        { cause: error instanceof Error ? error.message : 'module load failure' },
      );
    }

    try {
      return await odbc.connect(this.connectionString);
    } catch (error) {
      throw new HttpError(
        502,
        'odbc_connection_failed',
        'Failed to connect to the Sage 50c ODBC data source',
        { cause: error instanceof Error ? error.message : 'unknown ODBC connection failure' },
      );
    }
  }

  async healthcheck() {
    const connection = await this.connect();
    await connection.query('SELECT 1 AS healthy');
    return { status: 'ok' };
  }

  async listTables() {
    const connection = await this.connect();
    try {
      return await connection.tables(null, null, null, 'TABLE');
    } catch (error) {
      throw new HttpError(502, 'odbc_query_failed', 'Failed to list Sage tables', {
        cause: error instanceof Error ? error.message : 'unknown listTables failure',
      });
    }
  }

  async describeTable(tableName) {
    const connection = await this.connect();
    try {
      return await connection.columns(null, null, tableName, null);
    } catch (error) {
      throw new HttpError(502, 'odbc_query_failed', `Failed to describe Sage table ${tableName}`, {
        cause: error instanceof Error ? error.message : 'unknown describeTable failure',
      });
    }
  }

  async query(sql) {
    const connection = await this.connect();
    try {
      const rows = await connection.query(sql);
      return { rows };
    } catch (error) {
      throw new HttpError(502, 'odbc_query_failed', 'Failed to execute Sage query', {
        cause: error instanceof Error ? error.message : 'unknown query failure',
      });
    }
  }

  async close() {
    if (!this.connectionPromise) {
      return;
    }

    const connection = await this.connectionPromise;
    await connection.close();
    this.connectionPromise = undefined;
  }
}
