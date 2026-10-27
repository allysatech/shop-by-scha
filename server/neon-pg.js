// Legacy mirror removed: the application now queries PostgreSQL directly.
async function getNeonStatus(){const {db}=require('./db');return {connected:db.driver==='postgres',driver:db.driver};}
async function syncSqliteToNeon(){throw new Error('Implicit SQLite mirror/import is disabled. Export and reconcile existing business records before an explicit database migration.');}
module.exports={getNeonStatus,syncSqliteToNeon};
