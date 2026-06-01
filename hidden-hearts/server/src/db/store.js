// Picks the active persistence backend per call: Oracle when connected,
// otherwise the zero-install file store. Same interface either way.
import { hasDb } from './pool.js';
import * as oracle from './repos.js';
import * as file from './fileStore.js';

const impl = () => (hasDb() ? oracle : file);

export const usersRepo = {
  create: (...a) => impl().usersRepo.create(...a),
  findByUsername: (...a) => impl().usersRepo.findByUsername(...a),
  findById: (...a) => impl().usersRepo.findById(...a),
};
export const gamesRepo = {
  record: (...a) => impl().gamesRepo.record(...a),
  historyForUser: (...a) => impl().gamesRepo.historyForUser(...a),
};
export const leaderboardRepo = {
  top: (...a) => impl().leaderboardRepo.top(...a),
};
export const backend = () => (hasDb() ? 'oracle' : 'file');
