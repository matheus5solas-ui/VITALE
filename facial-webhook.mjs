import {timingSafeEqual} from 'node:crypto';
export function validSecret(provided,expected){
 if(typeof expected!=='string'||expected.length<32||typeof provided!=='string')return false;
 const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
export function parseMonitor(body){
 if(!body||!Array.isArray(body.object_changes)||body.object_changes.length>100)throw new Error('invalid payload');
 const events=[];
 for(const change of body.object_changes){
  if(change.object!=='access_logs'||change.type!=='inserted')continue;
  const v=change.values;
  // Control iD event 7 = identificação autorizada; conferir firmware no equipamento.
  if(!v||String(v.event)!=='7')continue;
  const device=String(v.device_id??body.device_id??'');
  if(!/^\d{1,20}$/.test(device)||!/^\d{1,18}$/.test(String(v.id))||! /^[1-9]\d{0,17}$/.test(String(v.user_id)))throw new Error('invalid identifiers');
  const time=Number(v.time);
  if(!Number.isSafeInteger(time)||time<946684800||time>Date.now()/1000+300)throw new Error('invalid time');
  events.push({p_serial:device,p_log_id:String(v.id),p_user_id:String(v.user_id),p_occurred_at:new Date(time*1000).toISOString()});
 }
 return events;
}
