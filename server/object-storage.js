const fs=require('node:fs/promises');const path=require('node:path');
const configured=()=>Boolean(process.env.S3_BUCKET && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
let client;
function s3(){if(!client){const {S3Client}=require('@aws-sdk/client-s3');client=new S3Client({region:process.env.S3_REGION,endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:Boolean(process.env.S3_ENDPOINT),credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});}return client;}
async function putObject(key,buffer,contentType,localPath){
 if(configured()){const {PutObjectCommand}=require('@aws-sdk/client-s3');await s3().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:buffer,ContentType:contentType}));}
 else {if(process.env.VERCEL)throw new Error('Persistent file storage is not configured.');await fs.mkdir(path.dirname(localPath),{recursive:true});await fs.writeFile(localPath,buffer);}
}
async function getObject(key,localPath){
 if(configured()){const {GetObjectCommand}=require('@aws-sdk/client-s3');const r=await s3().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));return Buffer.from(await r.Body.transformToByteArray());}
 return fs.readFile(localPath);
}
module.exports={configured,putObject,getObject};
