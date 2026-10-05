const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origin='https://vitale-gestao.vercel.app';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
class Failure extends Error{constructor(message:string,public status=400){super(message);}}
async function request(path:string,body?:unknown,bearer=key,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const value=await response.json().catch(()=>({}));return {ok:response.ok,status:response.status,value};
}
async function rpc(name:string,body:unknown){const r=await request('/rest/v1/rpc/'+name,body);if(!r.ok)throw new Failure(r.value.message||'Não foi possível concluir esta operação.');return r.value;}
const hash=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
 if(req.method!=='POST')throw new Failure('Método não permitido',405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)throw new Failure('Origem não permitida',403);
 const bearer=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!bearer)throw new Failure('Entre novamente para continuar.',401);
 const auth=await request('/auth/v1/user',undefined,bearer);if(!auth.ok||!auth.value.id)throw new Failure('Sessão inválida. Abra o link mais recente do e-mail.',401);
 const raw=await req.text();if(raw.length>5000)throw new Failure('Requisição inválida');const body=JSON.parse(raw);
 if(body.action==='send'){
 const role=await request(`/rest/v1/staff?user_id=eq.${auth.value.id}&select=role,active`);if(!role.ok||!role.value[0]?.active||role.value[0].role!=='admin')throw new Failure('Acesso restrito ao administrador',403);
 if(!/^[0-9a-f-]{36}$/i.test(body.id||''))throw new Failure('Cadastro inválido');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),digest=await hash(token);
 const invite=await rpc('prepare_team_invite',{p_id:body.id,p_hash:digest});
 const redirect=origin+'/?invite='+token;
 let email=await request('/auth/v1/invite?redirect_to='+encodeURIComponent(redirect),{email:invite.email});
 if(!email.ok && (['email_exists','user_already_exists'].includes(email.value.error_code||email.value.code) || /already.*registered/i.test(email.value.msg||email.value.message||'')))email=await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{email:invite.email});
 if(!email.ok){await request(`/rest/v1/team_members?id=eq.${body.id}&invite_hash=eq.${digest}`,{invite_hash:null,invited_at:null,invite_expires_at:null},key,'PATCH');throw new Failure('O serviço de e-mail não confirmou o envio. Confira o endereço e tente novamente.');}
 return new Response(JSON.stringify({message:'Convite enviado. O cadastro deve ser concluído em até 5 minutos.',expires_at:invite.expires_at}),{headers});
 }
 if(body.action==='accept'){
 if(!/^[0-9a-f]{64}$/.test(body.token||'')||typeof body.password!=='string'||body.password.length<10||body.password.length>128)throw new Failure('Informe uma senha de 10 a 128 caracteres.');
 const digest=await hash(body.token);await rpc('check_team_invite',{p_hash:digest,p_user:auth.value.id});
 const update=await request('/auth/v1/admin/users/'+auth.value.id,{password:body.password},key,'PUT');if(!update.ok)throw new Failure('Não foi possível definir a senha. Use uma senha mais forte e tente novamente.');
 await rpc('accept_team_invite',{p_hash:digest,p_user:auth.value.id});
 return new Response(JSON.stringify({message:'Cadastro concluído. Entre com seu e-mail e sua senha.'}),{headers});
 }
 throw new Failure('Operação inválida');
 }catch(e){return new Response(JSON.stringify({message:e instanceof Failure?e.message:'Não foi possível concluir. Tente novamente.'}),{status:e instanceof Failure?e.status:500,headers});}
});
