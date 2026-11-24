import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const file of ['index.html','cloud.mjs','config.mjs','management.mjs','training.mjs','vitale-compartilhamento.jpg'])await copyFile(file,`public/${file}`);
