import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
import {api,esc,day,today,notify,allRows,currentStaff,currentData} from './cloud.mjs';
const $=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sendingInvites=new Set();
const expenseCategories=Array.from($('ledgerForm').elements.category.options, option=>[option.value,option.text]);
const categoryLabels=new Map([['pagamento','Pagamento'],...expenseCategories]);
let rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]},kind='income',loadVersion=0;
$('financeMonth').value=today.slice(0,7);
async function load(){const version=++loadVersion,role=currentStaff()?.role;if(!role){rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};return;}
const tables=role==='admin'?Object.keys(rows):role==='professional'?['clinical_records']:[];
try{const values=await Promise.all(tables.map(t=>allRows(t,`${t==='partner_connections'?'partner':'created_at'}.desc`,t==='team_members'?'id,name,email,username,role,registration,active,user_id,created_at,invited_at,invite_expires_at,accepted_at':'*')));if(version!==loadVersion||role!==currentStaff()?.role)return;rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]};tables.forEach((t,i)=>rows[t]=values[i]);render();}catch(e){notify(e.message);}}
window.addEventListener('vitale:refresh',load);
function physioMonthlyTotals(data, clinicalRecords, ledger){
 const patientIds=new Set(data.students.filter(student=>student.activity==='Fisioterapia').map(student=>student.id));
 const months=new Map();
 function count(date,studentId,type){
  if(!date||!studentId)return;
  const month=date.slice(0,7);
  if(!months.has(month))months.set(month,{attended:new Set(),paid:new Set()});
  months.get(month)[type].add(studentId);
 }
 for(const appointment of data.appointments){
  if(appointment.activity==='Fisioterapia'&&appointment.status==='completed'){
   count(day(appointment.starts_at),appointment.student_id,'attended');
  }
 }
 for(const record of clinicalRecords){
  if(patientIds.has(record.student_id)&&['Avaliação','Evolução'].includes(record.kind)){
   count(record.recorded_on,record.student_id,'attended');
  }
 }
 for(const payment of ledger){
  if(payment.kind==='income'&&(!payment.settlement_status||payment.settlement_status==='received')&&patientIds.has(payment.student_id)){
   count(payment.paid_on,payment.student_id,'paid');
  }
 }
 return months;
}
function renderPhysioMonthlyHistory(data,role){
 const panel=$('physioMonthlyHistory');
 if(role!=='admin'){panel.innerHTML='';return;}
 const selected=$('financeMonth').value;
 const months=physioMonthlyTotals(data,rows.clinical_records,rows.ledger);
 const label=month=>month.split('-').reverse().join('/');
 const monthRows=[...months.keys()].sort().reverse().map(month=>{
  const {attended,paid}=months.get(month);
  return '<tr><td>'+esc(label(month))+'</td><td>'+attended.size+'</td><td>'+paid.size+'</td></tr>';
 }).join('');
 panel.innerHTML='<h3>Fisioterapia por mês</h3>'+
  (selected?'<p><strong>'+esc(label(selected))+'</strong> · '+(months.get(selected)?.attended.size||0)+' paciente(s) com atendimento registrado</p>':'')+
  '<p><small>Cada paciente conta uma vez por mês. O atendimento vem da agenda concluída ou de avaliação/evolução no prontuário. O pagamento é contado pela data no Financeiro.</small></p>'+
  '<table><thead><tr><th>Mês</th><th>Pacientes atendidos</th><th>Pacientes com pagamento</th></tr></thead><tbody>'+
  (monthRows||'<tr><td colspan="3">Nenhum registro de fisioterapia disponível.</td></tr>')+'</tbody></table>';
}
function render(){const d=currentData(),role=currentStaff()?.role;
renderPhysioMonthlyHistory(d,role);
const options='<option value="">Selecione</option>'+d.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('paymentStudent').innerHTML=options;$('clinicalStudent').innerHTML=options;
const list=rows.ledger.filter(r=>(r.competence_month||r.paid_on).startsWith($('financeMonth').value)),total=k=>list.filter(r=>r.kind===k).reduce((v,r)=>v+Number(r.amount),0);
$('financeSummary').innerHTML=`<div class="card">Recebimentos<b>${money(total('income'))}</b></div>`+(role==='admin'?`<div class="card">Despesas<b>${money(total('expense'))}</b></div><div class="card">Saldo do mês<b>${money(total('income')-total('expense'))}</b></div>`:'');
const costs=expenseCategories.map(([c,label])=>({label,total:list.filter(r=>r.kind==='expense'&&r.category===c).reduce((v,r)=>v+Number(r.amount),0)})),max=Math.max(1,...costs.map(c=>c.total));
$('costChart').innerHTML='<h3>Custos por categoria</h3>'+costs.map(c=>`<div class="chart-row"><span>${esc(c.label)}</span><div class="chart-track"><div class="chart-bar" style="width:${c.total/max*100}%" role="img" aria-label="${esc(c.label)}: ${money(c.total)}"></div></div><strong>${money(c.total)}</strong></div>`).join('');
const name=id=>d.students.find(s=>s.id===id)?.name||'—';
$('ledgerRows').innerHTML=list.map(r=>`<tr><td>${esc(r.paid_on.split('-').reverse().join('/'))}</td><td>${esc(r.description)}<br><small>${esc(r.method)}${r.method==='Cartão'?' · '+(r.installments||1)+'x':''}</small>${r.competence_month&&r.competence_month.slice(0,7)!==r.paid_on.slice(0,7)?'<br><small>Competência: '+esc(r.competence_month.slice(0,7).split('-').reverse().join('/'))+'</small>':''}</td><td>${esc(categoryLabels.get(r.category)??r.category)}</td><td>${esc(name(r.student_id))}</td><td>${r.kind==='expense'?'−':''}${money(r.amount)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum lançamento neste mês.</td></tr>';
renderTeam();
$('clinicalRows').innerHTML=rows.clinical_records.map(r=>`<article class="card"><h3>${esc(r.kind)} · ${esc(name(r.student_id))}</h3><small>${esc(r.recorded_on)} · ${esc(d.professionals.find(p=>p.user_id===r.professional_id)?.name||'Administrador')}</small><h4>Queixa e histórico</h4><p>${esc(r.complaint||'—')}</p><h4>Achados</h4><p>${esc(r.findings||'—')}</p><h4>Conduta / plano</h4><p>${esc(r.plan)}</p><button type="button" class="secondary" data-print-clinical="${esc(r.id)}">Imprimir atendimento</button></article>`).join('')||'<p>Nenhum registro clínico disponível.</p>';
$('partnerRows').innerHTML=['Wellhub','TotalPass'].map(p=>{const r=rows.partner_connections.find(r=>r.partner===p);return `<article class="card"><h3>${p}</h3><strong>Conexão pendente</strong><p>Identificação: ${esc(r?.clinic_identifier||'Não cadastrada')}</p><p>${esc(r?.notes||'Aguardando credenciamento e acessos oficiais.')}</p></article>`;}).join('');}
function printClinical(record){
 const person=currentData().students.find(s=>s.id===record.student_id);
 const professional=currentData().professionals.find(p=>p.user_id===record.professional_id);
 const teamProfessional=rows.team_members.find(p=>p.user_id===record.professional_id);
 const professionalName=teamProfessional?.name||professional?.name||((currentStaff()?.user_id===record.professional_id)?currentStaff()?.name:null);
 const professionalRegistration=teamProfessional?.registration||professional?.registration||((currentStaff()?.user_id===record.professional_id)?currentStaff()?.registration:null);
 const safe=value=>esc(value||'—');
 const printHtml=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento - Vitale</title><style>body{font-family:Arial,sans-serif;color:#173d32;margin:32px;line-height:1.5}h1{margin:0;color:#174a3c}small{color:#555}section{border-top:1px solid #ccc;margin-top:22px;padding-top:12px}p{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:A4;margin:18mm}</style></head><body><h1>VITALE</h1><small>Fisioterapia &amp; Pilates · Registro de atendimento</small><section><strong>Paciente:</strong> ${safe(person?.name)}<p><strong>Código:</strong> ${safe(person?.student_code)}<br><strong>Data:</strong> ${safe(record.recorded_on)}<br><strong>Profissional:</strong> ${safe(professionalName)}<br><strong>Tipo de registro:</strong> ${safe(record.kind)}</p></section><section><h3>Queixa e histórico</h3><p>${safe(record.complaint)}</p></section><section><h3>Achados</h3><p>${safe(record.findings)}</p></section><section><h3>Conduta / plano</h3><p>${safe(record.plan)}</p></section><p style="margin-top:60px;border-top:1px solid #777;padding-top:8px;width:65%;text-align:center">${safe(professionalName)}<br>${professionalRegistration?'CREFITO: '+safe(professionalRegistration):'CREFITO: não informado no cadastro'}<br><small>Assinatura do profissional responsável</small></p></body></html>`;
 const popup=window.open('','_blank');
 if(!popup){notify('Permita pop-ups para imprimir o atendimento.');return;}
 popup.document.open();popup.document.write(printHtml);popup.document.close();popup.focus();popup.print();
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-print-clinical]');if(!button)return;const record=rows.clinical_records.find(r=>r.id===button.dataset.printClinical);if(record)printClinical(record);});
$('financeMonth').onchange=render;
const ledgerForm=$('ledgerForm');
function updateLedgerFields(){
 const patient=currentData().students.find(student=>student.id===$('paymentStudent').value);
 const physio=kind==='income'&&patient?.activity==='Fisioterapia';
 const card=kind==='income'&&ledgerForm.elements.method.value==='Cartão';
 for(const [label,field,visible] of [
  ['physioModeLabel',ledgerForm.elements.physio_mode,physio],
  ['physioSessionsLabel',ledgerForm.elements.physio_sessions,physio],
  ['cardInstallmentsLabel',ledgerForm.elements.installments,card]
 ]){
  $(label).classList.toggle('hidden',!visible);
  field.disabled=!visible;
  field.required=Boolean(visible);
 }
 ledgerForm.elements.description.required=!physio;
 ledgerForm.elements.description.maxLength=physio?130:200;
}
function openLedger(k,patient=null){
 kind=k;
 ledgerForm.reset();
 $('ledgerTitle').textContent=k==='income'?'Lançar pagamento':'Lançar despesa';
 $('paymentStudentLabel').classList.toggle('hidden',k==='expense');
 $('paymentStudent').required=k==='income';
 $('expenseCategoryLabel').classList.toggle('hidden',k==='income');
 if(patient){
  $('paymentStudent').value=patient.id;
  if(patient.payment_method)ledgerForm.elements.method.value=patient.payment_method;
  if(!ledgerForm.elements.method.value)ledgerForm.elements.method.value='Pix';
  ledgerForm.elements.installments.value=patient.payment_installments||1;
 }
 ledgerForm.elements.paid_on.value=today;
 updateLedgerFields();
 $('ledgerDialog').showModal();
}
$('paymentStudent').onchange=updateLedgerFields;
ledgerForm.elements.method.onchange=updateLedgerFields;
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-patient-payment]');
 if(!button||currentStaff()?.role!=='admin')return;
 const patient=currentData().students.find(student=>student.id===button.dataset.patientPayment&&student.activity==='Fisioterapia');
 if(patient)openLedger('income',patient);
});
$('newPayment').onclick=()=>openLedger('income');$('newExpense').onclick=()=>openLedger('expense');$('newTeam').onclick=()=>{$('teamForm').reset();$('teamForm').elements.username.readOnly=false;$('teamForm').elements.password.required=true;$('teamDialog').showModal();};$('newClinical').onclick=()=>{$('clinicalForm').elements.recorded_on.value=today;$('clinicalDialog').showModal();};
async function submit(form,action,dialog,message){form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await action(Object.fromEntries(new FormData(form)));await load();if(dialog)$(dialog).close();form.reset();notify(message);}catch(e){notify(e.message);}finally{button.disabled=false;}};}
submit(ledgerForm,({physio_mode,physio_sessions,installments,...d})=>{
 const detail=physio_mode?`Fisioterapia · ${physio_mode} · ${physio_sessions} sessão(ões)`:'';
 const description=[detail,d.description.trim()].filter(Boolean).join(' · ');
 return api('/rest/v1/ledger',{method:'POST',body:JSON.stringify({...d,description,kind,
  amount:Number(d.amount),installments:Number(installments||1),
  student_id:kind==='income'?d.student_id:null,category:kind==='income'?'pagamento':d.category})});
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
