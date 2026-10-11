const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://vitale-gestao.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,prefer','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
async function call(path:string,body?:unknown,token=key,method=body===undefined?'GET':'POST'){
const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
return {ok:r.ok,value:await r.json().catch(()=>({}))};}
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response(null,{headers});
const fail=(message:string,status=400)=>new Response(JSON.stringify({message}),{status,headers});
try{
if(req.method!=='POST')return fail('Método não permitido',405);
const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
if(!token)return fail('Sessão inválida',401);
const auth=await call('/auth/v1/user',undefined,token);
if(!auth.ok||!auth.value.id)return fail('Sessão inválida',401);
const staff=await call('/rest/v1/staff?user_id=eq.'+auth.value.id+'&select=role,active');
if(!staff.ok||!staff.value[0]?.active||staff.value[0].role!=='admin')return fail('Somente o administrador pode definir acessos.',403);
const raw=await req.text();if(raw.length>3000)return fail('Requisição inválida');
const b=JSON.parse(raw),username=String(b.username||'').trim().toLowerCase();
if(!/^[0-9a-f-]{36}$/i.test(b.id||'')||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))return fail('Usuário: 3 a 40 caracteres, letras sem acento, números, ponto, hífen ou sublinhado.');
if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)return fail('Defina uma senha com 10 a 128 caracteres.');
const result=await call('/rest/v1/team_members?id=eq.'+b.id+'&select=id,user_id,username,active');
const m=result.value[0];if(!result.ok||!m?.active)return fail('Cadastro não encontrado.');
if(m.username&&m.username!==username)return fail('O usuário já definido não pode ser alterado. Você pode redefinir a senha.');
const taken=await call('/rest/v1/team_members?username=eq.'+encodeURIComponent(username)+'&select=id');
if(!taken.ok||taken.value.some((x:{id:string})=>x.id!==b.id))return fail('Esse usuário já está em uso.');
if(m.user_id){
const s=await call('/rest/v1/staff?user_id=eq.'+m.user_id+'&select=role');
if(s.value[0]?.role==='admin')return fail('O acesso do administrador não pode ser alterado aqui.',403);
}
const email=username+'@login.vitale.invalid';
const created=!m.user_id;
const user=await call(created?'/auth/v1/admin/users':'/auth/v1/admin/users/'+m.user_id,{email,password:b.password,email_confirm:true},key,created?'POST':'PUT');
if(!user.ok)return fail('Não foi possível definir o acesso. Confira se o usuário está disponível e use uma senha mais forte.');
const id=user.value.id||user.value.user?.id;if(!id)return fail('Não foi possível confirmar o acesso.',500);
const saved=await call('/rest/v1/rpc/enable_team_login',{p_id:b.id,p_user:id,p_username:username,p_admin:auth.value.id});
if(!saved.ok){
if(created)await call('/auth/v1/admin/users/'+id,undefined,key,'DELETE');
return fail('Não foi possível vincular o acesso. Recarregue e tente novamente.',409);
}
return new Response(JSON.stringify({message:'Acesso salvo. Entre com o usuário '+username+' e a senha definida.'}),{headers});
}catch{return fail('Não foi possível concluir. Tente novamente.',500);}
});