import {validSecret,parseMonitor} from '../facial-webhook.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method not allowed'});
 const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,FACIAL_WEBHOOK_SECRET}=process.env;
 if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!FACIAL_WEBHOOK_SECRET)return res.status(503).json({error:'integration not configured'});
 // Gateway local autentica por header. Não expor porta HTTP do aparelho na internet.
 if(!validSecret(req.headers['x-vitale-device-secret'],FACIAL_WEBHOOK_SECRET))return res.status(401).json({error:'unauthorized'});
 let events;
 try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>65536)return res.status(413).json({error:'payload too large'});events=parseMonitor(typeof req.body==='string'?JSON.parse(req.body):req.body);}catch{return res.status(400).json({error:'invalid payload'});}
 try{
  for(const event of events){
   const result=await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_face_event`,{method:'POST',headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(8000)});
   if(!result.ok)return res.status(502).json({error:'event not persisted'});
  }
  return res.status(200).json({accepted:events.length});
 }catch{return res.status(502).json({error:'integration temporarily unavailable'});}
}
