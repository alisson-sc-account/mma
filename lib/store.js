/* Armazenamento chave/valor. Postgres quando DATABASE_URL existe (Railway), arquivo JSON local caso contrario. */
const fs = require('fs');
const path = require('path');

class Store {
  async init() {
    // O Neon entrega "&channel_binding=require" no fim da string; o driver pg nao usa isso, entao tiramos.
    const url = (process.env.DATABASE_URL || '').trim().replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
    if (url) {
      const { Pool } = require('pg');
      const internal = /railway\.internal|localhost|127\.0\.0\.1/.test(url);
      this.pool = new Pool({
        connectionString: url,
        ssl: internal || process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      });
      await this.pool.query('create table if not exists kv (key text primary key, value jsonb not null)');
      this.mode = 'postgres';
    } else {
      const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
      fs.mkdirSync(dir, { recursive: true });
      this.file = path.join(dir, 'db.json');
      this.mem = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8') || '{}') : {};
      this.mode = 'arquivo';
    }
  }

  async get(key) {
    if (this.pool) {
      const r = await this.pool.query('select value from kv where key = $1', [key]);
      return r.rows.length ? r.rows[0].value : null;
    }
    return key in this.mem ? this.mem[key] : null;
  }

  async set(key, value) {
    if (this.pool) {
      await this.pool.query(
        'insert into kv (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value',
        [key, JSON.stringify(value)]
      );
      return;
    }
    this.mem[key] = value;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.mem));
    fs.renameSync(tmp, this.file);
  }

  async del(key) {
    if (this.pool) {
      await this.pool.query('delete from kv where key = $1', [key]);
      return;
    }
    delete this.mem[key];
    fs.writeFileSync(this.file, JSON.stringify(this.mem));
  }
}

module.exports = new Store();
