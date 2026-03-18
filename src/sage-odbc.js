export class SageOdbcClient {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.connectionPromise = undefined;
  }

  async connect() {
    if (!this.connectionPromise) {
      this.connectionPromise = this.#openConnection();
    }

    return this.connectionPromise;
  }

  async #openConnection() {
    let odbc;

    try {
      ({ default: odbc } = await import('odbc'));
    } catch (error) {
      throw new Error(
        'The optional "odbc" package is not installed. Run "npm install" on the host where this service will access Sage 50c.',
        { cause: error },
      );
    }

    return odbc.connect(this.connectionString);
  }

  async listTables() {
    const connection = await this.connect();
    return connection.tables(null, null, null, 'TABLE');
  }

  async describeTable(tableName) {
    const connection = await this.connect();
    return connection.columns(null, null, tableName, null);
  }

  async query(sql) {
    const connection = await this.connect();
    const rows = await connection.query(sql);
    return { rows };
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
