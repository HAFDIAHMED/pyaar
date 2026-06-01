import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8080),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  db: {
    user: process.env.DB_USER || 'pyaar',
    password: process.env.DB_PASSWORD || 'pyaar_pw',
    connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/XEPDB1',
    poolMin: Number(process.env.DB_POOL_MIN || 1),
    poolMax: Number(process.env.DB_POOL_MAX || 6),
    // Oracle Cloud / wallet (thin mode) — empty locally
    walletDir: process.env.ORACLE_WALLET_DIR || '',
    walletPassword: process.env.ORACLE_WALLET_PASSWORD || '',
  },
};

export const isProd = config.env === 'production';
