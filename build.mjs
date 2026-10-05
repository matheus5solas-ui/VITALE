import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const file of ['index.html','cloud.mjs','config.mjs'])await copyFile(file,`public/${file}`);
