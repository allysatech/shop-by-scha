// Async repository adapter. PostgreSQL is authoritative when DATABASE_URL exists.
// No per-instance SQLite mirror or background overwrite of business records.
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function translate(sql) {
  let n=0;
  // Preserve question marks inside SQL literals while binding values safely.
  let text=sql.replace(/'(?:''|[^'])*'|\?/g, token=>token==='?' ? `$${++n}` : token)
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g,'SERIAL PRIMARY KEY')
    .replace(/\s+COLLATE NOCASE/g,'');
  if (/INSERT OR IGNORE INTO/i.test(text)) text=text.replace(/INSERT OR IGNORE INTO/i,'INSERT INTO').trim().replace(/;$/,'')+' ON CONFLICT DO NOTHING';
  if (/INSERT OR REPLACE INTO sessions/i.test(text)) text=text.replace(/INSERT OR REPLACE INTO/i,'INSERT INTO').trim().replace(/;$/,'')+' ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id, csrf_token=EXCLUDED.csrf_token, login_context=EXCLUDED.login_context, expires_at=EXCLUDED.expires_at';
  return text;
}
function createPostgres() {
  const embedded=process.env.SCHA_DATABASE==='pglite' && process.env.SCHA_ENV==='test';
  let pool;
  if(embedded) {
    const {PGlite}=require('@electric-sql/pglite');
    const engine=new PGlite();
    pool={query:(s,p)=>engine.query(s,p),connect:async()=>({query:(s,p)=>engine.query(s,p),release(){}}),end:()=>engine.close()};
  } else {
    const {Pool,types}=require('pg');types.setTypeParser(20,Number);
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
    pool.on('error',()=>console.error('Database connection failed; request will fail safely.'));
  }
  const query=(sql,params=[]) => (context.getStore()||pool).query(translate(sql),params);
  const db={driver:'postgres',
    prepare(sql){return {
      async get(...params){return (await query(sql,params)).rows[0];},
      async all(...params){return (await query(sql,params)).rows;},
      async run(...params){const returning=/^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql);const r=await query(translate(sql.trim().replace(/;$/,''))+(returning?' RETURNING *':''),params);return {changes:r.rowCount??r.affectedRows??r.rows.length,lastInsertRowid:r.rows[0]?.id};}
    };},
    async exec(sql){
      if(/^\s*PRAGMA/i.test(sql))return;
      // Migrations contain no procedural SQL; execute statements one by one.
      for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await query(statement);
    },
    async columns(table){return (await query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',[table])).rows;},
    close:()=>pool.end()
  };
  let tail=Promise.resolve();
  async function transaction(fn){
    if(context.getStore())return fn();
    // Also serialize the embedded test engine and queries within one instance.
    const prev=tail;let release;tail=new Promise(r=>release=r);await prev;
    let client;
    try {client=await pool.connect();await client.query('BEGIN');
      // Existing repositories perform multi-row inventory checks. This lock makes
      // those transactions atomic across independent serverless instances.
      if(!embedded)await client.query('SELECT pg_advisory_xact_lock(1935897199)');
      const value=await context.run(client,fn);await client.query('COMMIT');return value;
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});throw e;}
    finally{if(client)client.release();release();}
  }
  return {db,transaction};
}
module.exports={createPostgres,translate};
