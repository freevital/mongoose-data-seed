import { Subject } from 'rxjs/Subject';

import {
  getObjectWithSelectedKeys,
  normalizeSeederName,
} from '../utils/helpers';
import MdSeedRunnerError from './md-seed-runner-error';

export default class MdSeedRunner {
  static operations = {
    START: 'START',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    MONGOOSE_CONNECT_START: 'MONGOOSE_CONNECT_START',
    MONGOOSE_CONNECT_SUCCESS: 'MONGOOSE_CONNECT_SUCCESS',
    MONGOOSE_CONNECT_ERROR: 'MONGOOSE_CONNECT_ERROR',
    MONGOOSE_DROP_START: 'MONGOOSE_DROP_START',
    MONGOOSE_DROP_SUCCESS: 'MONGOOSE_DROP_SUCCESS',
    MONGOOSE_DROP_ERROR: 'MONGOOSE_DROP_ERROR',
    ALL_SEEDERS_START: 'ALL_SEEDERS_START',
    ALL_SEEDERS_FINISH: 'ALL_SEEDERS_FINISH',
    SEEDER_START: 'SEEDER_START',
    SEEDER_SUCCESS: 'SEEDER_SUCCESS',
    SEEDER_ERROR: 'SEEDER_ERROR',
  };

  /**
   * Creates MdSeedRunner
   * @param {AsyncFunction} connect     Connect to mongodb implementation
   * @param {AsyncFunction} dropdb      Drop/Clear the database implementation
   * @param {Object}        seedersList key=Seeder name | value=Seeder implementation
   */
  constructor({ connect, dropdb, seedersList }) {
    this.connect = connect;
    this.dropdb = dropdb;
    this.seedersList = seedersList;
    this.subject = new Subject();
  }

  run({ selectedSeeders = [], dropDatabase = false } = {}) {
    this._run({ selectedSeeders, dropDatabase });

    return this.subject.asObservable();
  }

  /*
    Private methods
   */

  async _run({ selectedSeeders, dropDatabase }) {
    const { START, SUCCESS, ERROR } = MdSeedRunner.operations;

    try {
      this.subject.next({
        type: START,
        payload: { selectedSeeders, dropDatabase },
      });

      await this._connectToMongodb();

      if (dropDatabase) {
        await this._dropDatabase();
      }

      await this._runSeeders(selectedSeeders);

      this.subject.next({
        type: SUCCESS,
        payload: { selectedSeeders, dropDatabase },
      });

      this.subject.complete();
    } catch (error) {
      const { type = ERROR, payload = { error } } = error;

      this.subject.error({ type, payload });
    }
  }

  async _connectToMongodb() {
    const {
      MONGOOSE_CONNECT_START,
      MONGOOSE_CONNECT_SUCCESS,
      MONGOOSE_CONNECT_ERROR,
    } = MdSeedRunner.operations;

    try {
      this.subject.next({ type: MONGOOSE_CONNECT_START });

      await this.connect();

      this.subject.next({ type: MONGOOSE_CONNECT_SUCCESS });
    } catch (error) {
      throw new MdSeedRunnerError({ type: MONGOOSE_CONNECT_ERROR, error });
    }
  }

  async _dropDatabase() {
    const {
      MONGOOSE_DROP_START,
      MONGOOSE_DROP_SUCCESS,
      MONGOOSE_DROP_ERROR,
    } = MdSeedRunner.operations;

    try {
      this.subject.next({ type: MONGOOSE_DROP_START });

      await this.dropdb();

      this.subject.next({ type: MONGOOSE_DROP_SUCCESS });
    } catch (error) {
      throw new MdSeedRunnerError({ type: MONGOOSE_DROP_ERROR, error });
    }
  }

  async _runSeeders(selectedSeeders) {
    const { ALL_SEEDERS_START, ALL_SEEDERS_FINISH } = MdSeedRunner.operations;

    const seeders = this._loadSelectedSeeders(selectedSeeders);

    this.subject.next({
      type: ALL_SEEDERS_START,
      payload: { seeders: Object.keys(seeders) },
    });

    for (const [name, Seeder] of Object.entries(seeders)) {
      await this._runSeeder({ name, Seeder });
    }

    this.subject.next({
      type: ALL_SEEDERS_FINISH,
      payload: { seeders: Object.keys(seeders) },
    });
  }

  async _runSeeder({ Seeder, name }) {
    const {
      SEEDER_START,
      SEEDER_SUCCESS,
      SEEDER_ERROR,
    } = MdSeedRunner.operations;

    try {
      this.subject.next({
        type: SEEDER_START,
        payload: { name },
      });

      const seeder = new Seeder();
      const results = await seeder.seed();

      this.subject.next({ type: SEEDER_SUCCESS, payload: { name, results } });
    } catch (error) {
      throw new MdSeedRunnerError({
        type: SEEDER_ERROR,
        payload: { name },
        error,
      });
    }
  }

  _loadSelectedSeeders(selectedSeeders) {
    if (selectedSeeders && selectedSeeders.length > 0) {
      return getObjectWithSelectedKeys(
        this.seedersList,
        selectedSeeders.map(name => normalizeSeederName(name))
      );
    }

    return this.seedersList;
  }
}
