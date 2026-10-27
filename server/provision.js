process.env.SCHA_MIGRATE='1';
process.env.SCHA_PROVISION='1';
const {ready,db}=require('./db');
ready.then(()=>require('./seed').seedIfNeeded()).then(()=>db.close()).catch(e=>{console.error(e.message);process.exitCode=1;});
