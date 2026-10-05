import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMonitor,validSecret} from './facial-webhook.mjs';
const payload=(event=7)=>({device_id:123,object_changes:[{object:'access_logs',type:'inserted',values:{id:'1',user_id:'42',time:1728120000,event}}]});
test('aceita identificação autorizada e preserva IDs como strings',()=>{const [e]=parseMonitor(payload());assert.equal(e.p_user_id,'42');assert.equal(e.p_serial,'123');});
test('acesso negado não marca presença',()=>assert.deepEqual(parseMonitor(payload(6)),[]));
test('rejeita usuário desconhecido e payload incorreto',()=>{const p=payload();p.object_changes[0].values.user_id=0;assert.throws(()=>parseMonitor(p));assert.throws(()=>parseMonitor({}));});
test('autenticação exige segredo forte e igualdade exata',()=>{assert.equal(validSecret('x','x'),false);assert.equal(validSecret('a'.repeat(32),'a'.repeat(32)),true);assert.equal(validSecret('b'.repeat(32),'a'.repeat(32)),false);});
