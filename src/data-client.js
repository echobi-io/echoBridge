import path from 'node:path';
import { HttpError } from './errors.js';
import { MockSageClient } from './mock-sage.js';
import { SageOdbcClient } from './sage-odbc.js';

export function createDataClient(config) {
  if (config.dataSourceMode === 'mock') {
    return new MockSageClient(config.mockDataFile || path.join('mock-data', 'sage-sample.json'));
  }

  if (config.dataSourceMode === 'odbc') {
    return new SageOdbcClient(config.odbcConnectionString);
  }

  throw new HttpError(500, 'invalid_config', `Unsupported DATA_SOURCE_MODE: ${config.dataSourceMode}`);
}
