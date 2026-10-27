const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
for(const name of fs.readdirSync(path.join(__dirname))){if(name.endsWith('.js'))execFileSync(process.execPath,['--check',path.join(__dirname,name)],{stdio:'inherit'});}
console.log('Server syntax verified. Build performs no database writes or seed.');

const parser=require('@babel/parser');for(const f of fs.readdirSync(path.join(__dirname,'../public'))){if(f.endsWith('.js'))parser.parse(fs.readFileSync(path.join(__dirname,'../public',f),'utf8'),{sourceType:'module'});}console.log('Frontend module syntax verified.');
