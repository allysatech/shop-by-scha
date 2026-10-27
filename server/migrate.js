process.env.SCHA_MIGRATE='1';
const {ready,db}=require('./db');ready.then(()=>db.close()).then(()=>console.log('Additive schema migration complete; existing records preserved.')).catch(e=>{console.error(e.message);process.exitCode=1;});
