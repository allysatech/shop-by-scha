const {db,runTransaction}=require('./db');
async function sendNotification(id){
 return runTransaction(async()=>{
  const job=await db.prepare('SELECT * FROM notification_jobs WHERE id = ?').get(id);
  if(!job || job.status==='sent_logged')return job;
  if(!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.APP_URL){
    await db.prepare('UPDATE notification_jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?').run('pending_smtp','Email sender and application URL need configuration.',new Date().toISOString(),id);
    return await db.prepare('SELECT * FROM notification_jobs WHERE id = ?').get(id);
  }
  try {
    const {Resend}=require('resend');const sender=new Resend(process.env.RESEND_API_KEY);
    const action=job.action_url ? new URL(job.action_url,process.env.APP_URL).href : '';
    const result=await sender.emails.send({from:process.env.RESEND_FROM_EMAIL,to:job.recipient_email,subject:job.subject,text:job.body_text+(action?'\n\n'+action:'')},{idempotencyKey:job.idempotency_key});
    if(result.error)throw new Error(result.error.message);
    if(!result.data?.id)throw new Error('Provider did not return an acceptance ID.');
    await db.prepare('UPDATE notification_jobs SET status = ?, provider_message_id = ?, last_error = NULL, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?').run('sent_logged',result.data.id,new Date().toISOString(),id);
  }catch(e){await db.prepare('UPDATE notification_jobs SET status = ?, last_error = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?').run('failed',String(e.message).slice(0,400),new Date().toISOString(),id);}
  return await db.prepare('SELECT * FROM notification_jobs WHERE id = ?').get(id);
 });
}
async function runJobs(){const {sweepExpiredReservations}=require('./services');await sweepExpiredReservations();const jobs=await db.prepare("SELECT id FROM notification_jobs WHERE status IN ('pending_smtp','failed') ORDER BY id LIMIT 20").all();for(const j of jobs)await sendNotification(j.id);return {processed:jobs.length};}
module.exports={sendNotification,runJobs};
