import oracledb from 'oracledb';
import { config } from '../config.js';

// node-oracledb 6+ defaults to "Thin" mode (pure JS) when initOracleClient() is
// NOT called — so no Oracle Instant Client install is required, locally or on
// Hostinger. Thin mode talks to Oracle XE 21 and Oracle Cloud Autonomous DB.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let pool = null;

export async function initDb() {
  const opts = {
    user: config.db.user,
    password: config.db.password,
    connectString: config.db.connectString,
    poolMin: config.db.poolMin,
    poolMax: config.db.poolMax,
    poolIncrement: 1,
  };
  if (config.db.walletDir) {
    opts.walletLocation = config.db.walletDir;       // Oracle Cloud wallet (thin mode)
    if (config.db.walletPassword) opts.walletPassword = config.db.walletPassword;
  }
  const p = await oracledb.createPool(opts);
  // sanity ping — if the DB is unreachable, tear the pool down so hasDb() is accurate
  try {
    const c = await p.getConnection();
    await c.execute('SELECT 1 FROM dual');
    await c.close();
  } catch (e) {
    try { await p.close(0); } catch {}
    throw e;
  }
  pool = p;
  return pool;
}

export function hasDb() { return !!pool; }

export async function query(sql, binds = {}, opts = {}) {
  if (!pool) throw new Error('DB not initialised');
  const c = await pool.getConnection();
  try {
    return await c.execute(sql, binds, { autoCommit: true, ...opts });
  } finally {
    await c.close();
  }
}

export async function closeDb() {
  if (pool) { try { await pool.close(10); } catch {} pool = null; }
}

export { oracledb };
