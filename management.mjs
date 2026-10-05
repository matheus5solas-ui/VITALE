import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
import {api,esc,today,notify,allRows,currentStaff,currentData} from './cloud.mjs';
const $=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]},kind='income',loadVersion=0;
$('financeMonth').value=today.slice(0,7);
async function load(){const version=++loadVersion,role=currentStaff()?.role;if(!role){rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};return;}
const tables=role==='admin'?Object.keys(rows):role==='reception'?['ledger']:['clinical_records'];
try{const values=await Promise.all(tables.map(t=>allRows(t,`${t==='partner_connections'?'partner':'created_at'}.desc`,t==='team_members'?'id,name,email,role,registration,active,user_id,created_at,invited_at,invite_expires_at,accepted_at':'*')));if(version!==loadVersion||role!==currentStaff()?.role)return;rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};tables.forEach((t,i)=>rows[t]=values[i]);render();}catch(e){notify(e.message);}}
window.addEventListener('vitale:refresh',load);
function render(){const d=currentData(),role=currentStaff()?.role;
const options='<option value="">Selecione</option>'+d.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('paymentStudent').innerHTML=options;$('clinicalStudent').innerHTML=options;
const list=rows.ledger.filter(r=>r.paid_on.startsWith($('financeMonth').value)),total=k=>list.filter(r=>r.kind===k).reduce((v,r)=>v+Number(r.amount),0);
$('financeSummary').innerHTML=`<div class="card">Recebimentos<b>${money(total('income'))}</b></div>`+(role==='admin'?`<div class="card">Despesas<b>${money(total('expense'))}</b></div><div class="card">Saldo do mês<b>${money(total('income')-total('expense'))}</b></div>`:'');
const costs=['materiais','pessoal','outros'].map(c=>({category:c,total:list.filter(r=>r.kind==='expense'&&r.category===c).reduce((v,r)=>v+Number(r.amount),0)})),max=Math.max(1,...costs.map(c=>c.total));
$('costChart').innerHTML='<h3>Custos por categoria</h3>'+costs.map(c=>`<div class="chart-row"><span>${esc(c.category)}</span><div class="chart-track"><div class="chart-bar" style="width:${c.total/max*100}%" role="img" aria-label="${esc(c.category)}: ${money(c.total)}"></div></div><strong>${money(c.total)}</strong></div>`).join('');
const name=id=>d.students.find(s=>s.id===id)?.name||'—';
$('ledgerRows').innerHTML=list.map(r=>`<tr><td>${esc(r.paid_on.split('-').reverse().join('/'))}</td><td>${esc(r.description)}<br><small>${esc(r.method)}</small></td><td>${esc(r.category)}</td><td>${esc(name(r.student_id))}</td><td>${r.kind==='expense'?'−':''}${money(r.amount)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum lançamento neste mês.</td></tr>';
renderTeam();
$('clinicalRows').innerHTML=rows.clinical_records.map(r=>`<article class="card"><h3>${esc(r.kind)} · ${esc(name(r.student_id))}</h3><small>${esc(r.recorded_on)} · ${esc(d.professionals.find(p=>p.user_id===r.professional_id)?.name||'Administrador')}</small><h4>Queixa e histórico</h4><p>${esc(r.complaint||'—')}</p><h4>Achados</h4><p>${esc(r.findings||'—')}</p><h4>Conduta / plano</h4><p>${esc(r.plan)}</p></article>`).join('')||'<p>Nenhum registro clínico disponível.</p>';
$('partnerRows').innerHTML=['Wellhub','TotalPass'].map(p=>{const r=rows.partner_connections.find(r=>r.partner===p);return `<article class="card"><h3>${p}</h3><strong>Conexão pendente</strong><p>Identificação: ${esc(r?.clinic_identifier||'Não cadastrada')}</p><p>${esc(r?.notes||'Aguardando credenciamento e acessos oficiais.')}</p></article>`;}).join('');}
$('financeMonth').onchange=render;
function openLedger(k){kind=k;$('ledgerForm').reset();$('ledgerTitle').textContent=k==='income'?'Lançar pagamento':'Lançar despesa';$('paymentStudentLabel').classList.toggle('hidden',k==='expense');$('paymentStudent').required=k==='income';$('expenseCategoryLabel').classList.toggle('hidden',k==='income');$('ledgerForm').elements.paid_on.value=today;$('ledgerDialog').showModal();}
$('newPayment').onclick=()=>openLedger('income');$('newExpense').onclick=()=>openLedger('expense');$('newTeam').onclick=()=>{$('teamForm').reset();$('teamForm').elements.email.readOnly=false;$('teamDialog').showModal();};$('newClinical').onclick=()=>{$('clinicalForm').elements.recorded_on.value=today;$('clinicalDialog').showModal();};
async function submit(form,action,dialog,message){form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await action(Object.fromEntries(new FormData(form)));await load();if(dialog)$(dialog).close();form.reset();notify(message);}catch(e){notify(e.message);}finally{button.disabled=false;}};}
submit($('ledgerForm'),d=>api('/rest/v1/ledger',{method:'POST',body:JSON.stringify({...d,kind,amount:Number(d.amount),student_id:kind==='income'?d.student_id:null,category:kind==='income'?'pagamento':d.category})}),'ledgerDialog','Lançamento registrado.');
submit($('teamForm'),async d=>{await api('/rest/v1/rpc/edit_team',{method:'POST',body:JSON.stringify({p_id:d.id||null,p_name:d.name,p_email:d.email,p_role:d.role,p_registration:d.registration||null})});window.dispatchEvent(new Event('vitale:team'));},'teamDialog','Cadastro salvo. Consulte a coluna Acesso para verificar a habilitação.');
submit($('clinicalForm'),d=>api('/rest/v1/clinical_records',{method:'POST',body:JSON.stringify(d)}),'clinicalDialog','Registro clínico salvo.');
submit($('partnerForm'),d=>api('/rest/v1/partner_connections?on_conflict=partner',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...d,updated_at:new Date().toISOString()})}),null,'Configuração salva. A conexão oficial continua pendente.');
if(currentStaff())load();

function renderTeam(){
$('teamRows').innerHTML=rows.team_members.map(r=>{const expires=r.invite_expires_at&&new Date(r.invite_expires_at),status=r.user_id?'Habilitado':!expires?'Convite não enviado':expires<=new Date()?'Expirado · reenviar':`Convite enviado · válido até ${expires.toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;return `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.role==='professional'?'Fisioterapeuta':'Recepção'}</td><td>${esc(r.registration||'—')}</td><td>${esc(status)}</td><td><button data-edit-team="${r.id}">Editar</button> ${r.user_id?'':`<button data-send-team="${r.id}">${r.invited_at?'Reenviar':'Enviar convite'}</button>`}</td></tr>`;}).join('')||'<tr><td colspan="6">Nenhum profissional cadastrado.</td></tr>';
}
setInterval(()=>{if(currentStaff()?.role==='admin')renderTeam();},30000);
document.addEventListener('click',async e=>{
const edit=e.target.closest('[data-edit-team]');if(edit){const row=rows.team_members.find(r=>r.id===edit.dataset.editTeam);if(!row)return;const form=$('teamForm');form.reset();for(const field of ['id','name','email','role','registration'])form.elements[field].value=row[field]||'';form.elements.email.readOnly=!!row.user_id;$('teamDialog').showModal();return;}
const send=e.target.closest('[data-send-team]');if(!send)return;send.disabled=true;try{const r=await api('/functions/v1/team-invite',{method:'POST',body:JSON.stringify({action:'send',id:send.dataset.sendTeam})});notify(r.message);await load();}catch(err){notify(err.message);await load();}finally{send.disabled=false;}
});
const url=new URL(location.href),inviteToken=url.searchParams.get('invite');
if(inviteToken){
const fragment=new URLSearchParams(location.hash.slice(1)),access=fragment.get('access_token');
$('loginPanel').classList.add('hidden');$('invitePanel').classList.remove('hidden');
history.replaceState(null,'',location.pathname+'?invite='+encodeURIComponent(inviteToken));
if(!access){$('inviteMessage').textContent='Abra o link completo do convite mais recente recebido por e-mail. Se expirou, peça o reenvio.';$('inviteForm').classList.add('hidden');}
$('inviteForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');if($('invitePassword').value!==$('inviteConfirm').value){$('inviteMessage').textContent='As senhas não coincidem.';return;}button.disabled=true;try{
const r=await fetch(SUPABASE_URL+'/functions/v1/team-invite',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action:'accept',token:inviteToken,password:$('invitePassword').value}),signal:AbortSignal.timeout(30000)}),result=await r.json();if(!r.ok)throw Error(result.message||'Não foi possível concluir o cadastro.');
$('invitePanel').classList.add('hidden');$('loginPanel').classList.remove('hidden');$('loginMessage').textContent=result.message;history.replaceState(null,'',location.pathname);
}catch(err){$('inviteMessage').textContent=err.message;}finally{$('invitePassword').value='';$('inviteConfirm').value='';button.disabled=false;}};
}
