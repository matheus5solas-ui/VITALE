Deno.serve(async(req)=>{
const reply=(s,b)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json"}});
if(req.method!=="POST")return reply(405,{error:"method"});
const token=req.headers.get("x-vitale-device-secret")||"";
if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:"unauthorized"});
const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const headers={apikey:key,Authorization:"Bearer "+key,"content-type":"application/json"};
try{
const auth=await fetch(base+"/rest/v1/facial_connector_credentials?token_hash=eq."+hash+"&active=eq.true&select=device_serial,time_offset_seconds",{headers});
if(!auth.ok)return reply(503,{error:"unavailable"});
const rows=await auth.json();if(rows.length!==1)return reply(401,{error:"unauthorized"});
const raw=await req.text();if(new TextEncoder().encode(raw).length>65536)return reply(413,{error:"size"});
const body=JSON.parse(raw);if(!Array.isArray(body.object_changes)||body.object_changes.length>100)return reply(400,{error:"payload"});
const events=[];
for(const c of body.object_changes){
if(c.object!=="access_logs"||c.type!=="inserted"||String(c.values?.event)!=="7")continue;
const v=c.values,serial=String(v.device_id??body.device_id??""),t=Number(v.time)+rows[0].time_offset_seconds;
if(serial!==rows[0].device_serial||!/^\d{1,18}$/.test(String(v.id))||!/^[1-9]\d{0,17}$/.test(String(v.user_id))||!Number.isSafeInteger(t)||t<946684800||t>Date.now()/1000+300)return reply(400,{error:"event"});
events.push({p_serial:serial,p_log_id:String(v.id),p_user_id:String(v.user_id),p_occurred_at:new Date(t*1000).toISOString()});
}
const results=[];
for(const e of events){const r=await fetch(base+"/rest/v1/rpc/record_face_event",{method:"POST",headers,body:JSON.stringify(e)});if(!r.ok){
const err=await r.json().catch(()=>({}));
if(err.code==="P0001"&&["unknown facial user","inactive student"].includes(err.message)){
const saved=await fetch(base+"/rest/v1/facial_unmatched_events?on_conflict=device_serial,log_id",{method:"POST",headers:{...headers,Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({device_serial:e.p_serial,log_id:e.p_log_id,user_id:e.p_user_id,occurred_at:e.p_occurred_at,reason:err.message})});
if(!saved.ok)return reply(502,{error:"pending event not persisted"});
results.push({pending:true,reason:"binding_required",user_id:e.p_user_id});continue;
}
return reply(502,{error:"not persisted"});
}results.push(await r.json());}
return reply(200,{accepted:events.length,results});
}catch{return reply(503,{error:"temporarily unavailable"});}
});