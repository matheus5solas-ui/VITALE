import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
import {api,esc,today,notify,allRows,currentStaff,currentData} from './cloud.mjs';
const $=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sendingInvites=new Set();
let rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]},kind='income',loadVersion=0;
$('financeMonth').value=today.slice(0,7);
async function load(){const version=++loadVersion,role=currentStaff()?.role;if(!role){rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};return;}
const tables=role==='admin'?Object.keys(rows):role==='professional'?['clinical_records']:[];
try{const values=await Promise.all(tables.map(t=>allRows(t,`${t==='partner_connections'?'partner':'created_at'}.desc`,t==='team_members'?'id,name,email,username,role,registration,active,user_id,created_at,invited_at,invite_expires_at,accepted_at':'*')));if(version!==loadVersion||role!==currentStaff()?.role)return;rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};tables.forEach((t,i)=>rows[t]=values[i]);render();}catch(e){notify(e.message);}}
window.addEventListener('vitale:refresh',load);
function dayOfAppointment(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
function render(){const d=currentData(),role=currentStaff()?.role;
const options='<option value="">Selecione</option>'+d.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('paymentStudent').innerHTML=options;$('clinicalStudent').innerHTML=options;
const list=rows.ledger.filter(r=>r.paid_on.startsWith($('financeMonth').value)),total=k=>list.filter(r=>r.kind===k&&r.settlement_status==='received').reduce((v,r)=>v+Number(r.amount),0);
const pending=list.filter(r=>r.kind==='income'&&r.settlement_status==='pending').reduce((v,r)=>v+Number(r.amount),0);
const physiotherapy=d.appointments.filter(a=>a.activity==='fisioterapia'&&a.status==='completed'&&a.starts_at&&dayOfAppointment(a.starts_at).startsWith($('financeMonth').value)).length;
$('financeSummary').innerHTML=`<div class="card">Recebido no mês (por data da venda)<b>${money(total('income'))}</b></div><div class="card">Repasses pendentes<b>${money(pending)}</b></div><div class="card">Fisioterapia concluída (agenda)<b>${physiotherapy}</b></div>`+(role==='admin'?`<div class="card">Despesas<b>${money(total('expense'))}</b></div><div class="card">Saldo do mês<b>${money(total('income')-total('expense'))}</b></div>`:'');
const costs=['materiais','pessoal','outros'].map(c=>({category:c,total:list.filter(r=>r.kind==='expense'&&r.category===c).reduce((v,r)=>v+Number(r.amount),0)})),max=Math.max(1,...costs.map(c=>c.total));
$('costChart').innerHTML='<h3>Custos por categoria</h3>'+costs.map(c=>`<div class="chart-row"><span>${esc(c.category)}</span><div class="chart-track"><div class="chart-bar" style="width:${c.total/max*100}%" role="img" aria-label="${esc(c.category)}: ${money(c.total)}"></div></div><strong>${money(c.total)}</strong></div>`).join('');
const name=id=>d.students.find(s=>s.id===id)?.name||'—';
$('ledgerRows').innerHTML=list.map(r=>`<tr><td>${esc(r.paid_on.split('-').reverse().join('/'))}</td><td>${esc(r.description)}<br><small>${esc(r.method)}</small></td><td>${esc(r.category)}</td><td>${esc(name(r.student_id))}</td><td>${r.kind==='expense'?'−':''}${money(r.amount)}${r.card_fee>0?'<br><small>Taxa: '+money(r.card_fee)+'</small>':''}</td><td>${esc(r.settlement_status==='pending'?'Previsto '+(r.settlement_due_on||''):r.settlement_status==='received'?'Recebido':'Cancelado')}${r.kind==='income'&&r.settlement_status==='pending'?'<br><button type="button" data-confirm-settlement="'+esc(r.id)+'">Confirmar repasse</button>':''}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum lançamento neste mês.</td></tr>';
renderTeam();
$('clinicalRows').innerHTML=rows.clinical_records.map(r=>`<article class="card"><h3>${esc(r.kind)} · ${esc(name(r.student_id))}</h3><small>${esc(r.recorded_on)} · ${esc(d.professionals.find(p=>p.user_id===r.professional_id)?.name||'Administrador')}</small><h4>Queixa e histórico</h4><p>${esc(r.complaint||'—')}</p><h4>Achados</h4><p>${esc(r.findings||'—')}</p><h4>Conduta / plano</h4><p>${esc(r.plan)}</p></article>`).join('')||'<p>Nenhum registro clínico disponível.</p>';
$('partnerRows').innerHTML=['Wellhub','TotalPass'].map(p=>{const r=rows.partner_connections.find(r=>r.partner===p);return `<article class="card"><h3>${p}</h3><strong>Conexão pendente</strong><p>Identificação: ${esc(r?.clinic_identifier||'Não cadastrada')}</p><p>${esc(r?.notes||'Aguardando credenciamento e acessos oficiais.')}</p></article>`;}).join('');}
$('financeMonth').onchange=render;
const ledgerForm=$('ledgerForm');
function nextDay(iso){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function updateCardFields(){
 const income=kind==='income',card=income&&ledgerForm.elements.method.value==='Cartão';
 $('ledgerServiceLabel').classList.toggle('hidden',!income);
 $('ledgerCardFields').classList.toggle('hidden',!card);
 const fee=ledgerForm.elements.card_fee;
 if(card&&ledgerForm.elements.service_type.value==='pilates'&&Number(fee.value)===0)fee.value='5';
 if(card&&ledgerForm.elements.service_type.value!=='pilates'&&Number(fee.value)===5)fee.value='0';
 if(card)ledgerForm.elements.settlement_due_on.value=nextDay(ledgerForm.elements.paid_on.value||today);
}
ledgerForm.elements.method.onchange=updateCardFields;
ledgerForm.elements.service_type.onchange=updateCardFields;
ledgerForm.elements.paid_on.onchange=updateCardFields;
function openLedger(k){kind=k;ledgerForm.reset();$('ledgerTitle').textContent=k==='income'?'Lançar pagamento':'Lançar despesa';$('paymentStudentLabel').classList.toggle('hidden',k==='expense');$('paymentStudent').required=k==='income';$('expenseCategoryLabel').classList.toggle('hidden',k==='income');ledgerForm.elements.paid_on.value=today;updateCardFields();$('ledgerDialog').showModal();}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-confirm-settlement]');if(!b||currentStaff()?.role!=='admin')return;const id=b.dataset.confirmSettlement;if(!confirm('Confirmar que o valor integral líquido foi recebido na conta da Vitale?'))return;b.disabled=true;try{const result=await api('/rest/v1/ledger?id=eq.'+encodeURIComponent(id)+'&settlement_status=eq.pending',{method:'PATCH',body:JSON.stringify({settlement_status:'received',settled_on:today})});if(!result?.length)throw Error('O repasse já foi alterado. Atualize a página.');await load();notify('Repasse confirmado.');}catch(error){notify(error.message);}finally{b.disabled=false;}});
$('newPayment').onclick=()=>openLedger('income');$('newExpense').onclick=()=>openLedger('expense');$('newTeam').onclick=()=>{$('teamForm').reset();$('teamForm').elements.username.readOnly=false;$('teamForm').elements.password.required=true;$('teamDialog').showModal();};$('newClinical').onclick=()=>{$('clinicalForm').elements.recorded_on.value=today;$('clinicalDialog').showModal();};
async function submit(form,action,dialog,message){form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await action(Object.fromEntries(new FormData(form)));await load();if(dialog)$(dialog).close();form.reset();notify(message);}catch(e){notify(e.message);}finally{button.disabled=false;}};}
submit($('ledgerForm'),d=>{
 const gross=Number(d.amount),card=kind==='income'&&d.method==='Cartão',fee=card?Number(d.card_fee||0):0;
 if(!Number.isFinite(gross)||gross<=0||fee<0||fee>=gross)throw Error('Confira o valor e a taxa do cartão.');
 const body={kind,description:d.description,paid_on:d.paid_on,method:d.method,student_id:kind==='income'?d.student_id:null,category:kind==='income'?'pagamento':d.category,amount:gross-fee,gross_amount:gross,card_fee:fee,service_type:kind==='income'?d.service_type:null,installments:card?Number(d.installments||1):1,settlement_due_on:card?d.settlement_due_on:null,settlement_status:card&&!d.settlement_received?'pending':'received',settled_on:card&&!d.settlement_received?null:d.paid_on};
 if(body.installments<1||body.installments>24||!Number.isInteger(body.installments))throw Error('Quantidade de parcelas inválida.');
 return api('/rest/v1/ledger',{method:'POST',body:JSON.stringify(body)});
},'ledgerDialog','Lançamento registrado.');
submit($('teamForm'),async d=>{
 const existing=rows.team_members.find(r=>r.id===d.id);
 const id=await api('/rest/v1/rpc/edit_team',{method:'POST',body:JSON.stringify({p_id:d.id||null,p_name:d.name,p_email:existing?.email||crypto.randomUUID()+'@login.vitale.invalid',p_role:d.role,p_registration:d.registration||null})});
 $('teamForm').elements.id.value=id;await load();
 if(d.password){const r=await api('/functions/v1/team-access',{method:'POST',body:JSON.stringify({id,username:d.username,password:d.password})});notify(r.message);}
 window.dispatchEvent(new Event('vitale:team'));
},'teamDialog','Cadastro salvo. Confira o usuário e a situação do acesso.');

submit($('clinicalForm'),d=>api('/rest/v1/clinical_records',{method:'POST',body:JSON.stringify(d)}),'clinicalDialog','Registro clínico salvo.');
submit($('partnerForm'),d=>api('/rest/v1/partner_connections?on_conflict=partner',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...d,updated_at:new Date().toISOString()})}),null,'Configuração salva. A conexão oficial continua pendente.');
if(currentStaff())load();

function renderTeam(){
$('teamRows').innerHTML=rows.team_members.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.username||'Não definido')}</td><td>${r.role==='admin'?'Administrador':r.role==='professional'?'Fisioterapeuta':'Recepção'}</td><td>${esc(r.registration||'—')}</td><td>${r.username&&r.user_id?'Habilitado':r.user_id?'Acesso anterior por e-mail':'Acesso pendente'}</td><td><button data-edit-team="${r.id}">Editar / definir acesso</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhum profissional cadastrado.</td></tr>';
}
document.addEventListener('click',e=>{
const edit=e.target.closest('[data-edit-team]');if(!edit)return;
const row=rows.team_members.find(r=>r.id===edit.dataset.editTeam);if(!row)return;
const form=$('teamForm');form.reset();
for(const field of ['id','name','username','role','registration'])form.elements[field].value=row[field]||'';
form.elements.username.readOnly=!!row.username;
form.elements.password.required=!row.username;
$('teamDialog').showModal();
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
