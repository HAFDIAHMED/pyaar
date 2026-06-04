-- PYAAR — Hidden Hearts schema (Oracle).
-- Statements are separated by a single ';' on its own line; migrate.js runs each
-- and ignores ORA-00955 (object already exists) so it is safe to re-run.

CREATE TABLE users (
  id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      VARCHAR2(32) NOT NULL,
  email         VARCHAR2(160),
  password_hash VARCHAR2(100) NOT NULL,
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT uq_users_email    UNIQUE (email)
)
;

-- Idempotent column add for installs created before the email column existed.
-- migrate.js ignores ORA-01430 ("column being added already exists"), so this
-- block is safe to re-run on both fresh and upgraded databases.
ALTER TABLE users ADD email VARCHAR2(160)
;

ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email)
;

CREATE TABLE games (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        VARCHAR2(12),
  status      VARCHAR2(16) DEFAULT 'finished',
  num_players NUMBER(2),
  winner_name VARCHAR2(40),
  end_reason  VARCHAR2(40),
  ended_at    TIMESTAMP DEFAULT SYSTIMESTAMP
)
;

CREATE TABLE game_players (
  id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id   NUMBER NOT NULL REFERENCES games(id),
  user_id   NUMBER REFERENCES users(id),
  seat      NUMBER(2),
  name      VARCHAR2(40),
  is_ai     NUMBER(1) DEFAULT 0,
  score     NUMBER(4),
  heart     VARCHAR2(10),
  soulmate  NUMBER(1) DEFAULT 0,
  is_winner NUMBER(1) DEFAULT 0
)
;

CREATE INDEX ix_game_players_game ON game_players (game_id)
;

CREATE INDEX ix_game_players_user ON game_players (user_id)
;
