import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordPresence} from './attendance.mjs';
const fixture=()=>({students:[{id:'s1',faceId:'101'}],appointments:[{id:'a1',studentId:'s1',startsAt:'2026-10-05T12:00:00Z',status:'scheduled'}],attendance:[]});
test('face confirma aula e reprocessamento não duplica',()=>{const s=fixture();const e={studentId:'s1',occurredAt:'2026-10-05T11:55:00Z',source:'facial',eventId:'log1'};assert.equal(recordPresence(s,e).entry.appointmentId,'a1');assert.equal(s.appointments[0].status,'present');assert.equal(recordPresence(s,e).duplicate,true);assert.equal(recordPresence(s,{...e,eventId:'log2',occurredAt:'2026-10-05T12:10:00Z'}).duplicate,true);assert.equal(s.attendance.length,1);});
test('sem aula registra chegada para conferência',()=>{const s=fixture();assert.equal(recordPresence(s,{studentId:'s1',occurredAt:'2026-10-05T18:00:00Z',source:'facial',eventId:'log3'}).requiresReview,true);assert.equal(s.appointments[0].status,'scheduled');});
test('aluno sem vínculo facial não pode simular identificação',()=>{const s=fixture();s.students[0].faceId='';assert.throws(()=>recordPresence(s,{studentId:'s1',occurredAt:'2026-10-05T12:00:00Z',source:'facial'}));});
