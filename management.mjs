import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
import {api,esc,day,today,notify,allRows,currentStaff,currentData,isTestStudent} from './cloud.mjs';
const $=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sendingInvites=new Set();
const expenseCategories=Array.from($('ledgerForm').elements.category.options, option=>[option.value,option.text]);
const incomeCategory=$('ledgerForm').elements.income_category;
const otherIncomeCategories=new Map(Array.from(incomeCategory.options)
 .filter(option=>option.value!=='pagamento').map(option=>[option.value,option.text]));
for(const [value,label] of otherIncomeCategories){
 $('ledgerRevenueFilters').append(new Option(label,value));
}
const categoryLabels=new Map([['pagamento','Pagamento'],...expenseCategories,...otherIncomeCategories]);
let rows={ledger:[],team_members:[],clinical_records:[],partner_connections:[]},kind='income',loadVersion=0,settlingExpense=null;
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
 for(const student of data.students){
  if(patientIds.has(student.id))count(student.physio_first_visit_on,student.id,'attended');
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
   count(payment.competence_month||payment.paid_on,payment.student_id,'paid');
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
  '<p><small>Cada paciente conta uma vez por mês. O atendimento vem do primeiro atendimento registrado no cadastro, da agenda concluída ou de avaliação/evolução no prontuário. O pagamento é contado pela competência no Financeiro.</small></p>'+
  '<table><thead><tr><th>Mês</th><th>Pacientes atendidos</th><th>Pacientes com pagamento</th></tr></thead><tbody>'+
  (monthRows||'<tr><td colspan="3">Nenhum registro de fisioterapia disponível.</td></tr>')+'</tbody></table>';
}
function renderRevenueBreakdown(entries, students){
 const panel=$('revenueBreakdown');
 const activities=new Map(students.map(student=>[student.id,student.activity]));
 const totals=new Map([
  ['Pilates',0],['Fisioterapia',0],
  ...Array.from(otherIncomeCategories.keys(),category=>[category,0])
 ]);
 let total=0;
 for(const entry of entries){
  if(entry.kind!=='income'||(entry.settlement_status||'received')!=='received')continue;
  const activity=activities.get(entry.student_id);
  const source=otherIncomeCategories.has(entry.category)?entry.category:
   activity==='Pilates'||activity==='Fisioterapia'?activity:'unclassified';
  const cents=Math.round(Number(entry.amount)*100);
  totals.set(source,(totals.get(source)||0)+cents);
  total+=cents;
 }
 const title='<h3>Receitas por origem</h3>';
 if(!total){panel.innerHTML=title+'<p>Nenhum recebimento na competência selecionada.</p>';return;}
 const labels=new Map([
  ['Pilates','Alunos de Pilates'],['Fisioterapia','Pacientes de fisioterapia'],
  ...otherIncomeCategories,['unclassified','Receitas sem origem identificada']
 ]);
 const percent=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
 const lines=Array.from(totals,([source,cents])=>
  '<tr><th scope="row">'+esc(labels.get(source))+'</th><td>'+money(cents/100)+
  '</td><td>'+percent.format(cents/total)+'</td></tr>').join('');
 panel.innerHTML=title+'<table><thead><tr><th scope="col">Origem</th><th scope="col">Recebido</th>'+
  '<th scope="col">% do mês</th></tr></thead><tbody>'+lines+'</tbody><tfoot><tr>'+
  '<th scope="row">Total recebido</th><td><strong>'+money(total/100)+'</strong></td><td>100%</td></tr></tfoot></table>';
}
function render(){const d=currentData(),role=currentStaff()?.role;
const testStudentIds=new Set(d.students.filter(isTestStudent).map(student=>student.id));
renderPhysioMonthlyHistory({
 ...d,students:d.students.filter(student=>!testStudentIds.has(student.id)),
 appointments:d.appointments.filter(appointment=>!testStudentIds.has(appointment.student_id))
},role);
const options='<option value="">Selecione</option>'+d.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('paymentStudent').innerHTML=options;$('clinicalStudent').innerHTML=options;
const activity=$('ledgerActivity').value;
const otherIncome=otherIncomeCategories.has(activity);
const matchingStudents=new Set(d.students.filter(student=>student.activity===activity).map(student=>student.id));
const monthEntries=rows.ledger.filter(r=>(r.competence_month||r.paid_on).startsWith($('financeMonth').value)&&r.settlement_status!=='cancelled'&&!testStudentIds.has(r.student_id));
renderRevenueBreakdown(monthEntries,d.students);
const list=monthEntries.filter(r=>!activity||(r.kind==='income'&&(otherIncome?r.category===activity:matchingStudents.has(r.student_id))));
$('costChart').classList.toggle('hidden',Boolean(activity)||role!=='admin');
const total=(kind,status='received')=>list.filter(r=>r.kind===kind&&(r.settlement_status||'received')===status).reduce((sum,r)=>sum+Number(r.amount),0);
$('financeSummary').innerHTML=`<div class="card">Recebimentos${activity?' de '+esc(otherIncomeCategories.get(activity)??activity):''}<b>${money(total('income'))}</b></div>`+(role==='admin'&&!activity?`<div class="card">Despesas pagas<b>${money(total('expense'))}</b></div><div class="card">Despesas em aberto<b>${money(total('expense','pending'))}</b></div><div class="card">Saldo do mês<b>${money(total('income')-total('expense'))}</b></div>`:'');
const costs=expenseCategories.map(([c,label])=>({label,total:list.filter(r=>r.kind==='expense'&&r.category===c).reduce((v,r)=>v+Number(r.amount),0)})),max=Math.max(1,...costs.map(c=>c.total));
$('costChart').innerHTML='<h3>Custos por categoria</h3><p><small>Inclui despesas pagas e em aberto na competência selecionada.</small></p>'+costs.map(c=>`<div class="chart-row"><span>${esc(c.label)}</span><div class="chart-track"><div class="chart-bar" style="width:${c.total/max*100}%" role="img" aria-label="${esc(c.label)}: ${money(c.total)}"></div></div><strong>${money(c.total)}</strong></div>`).join('');
const name=id=>d.students.find(s=>s.id===id)?.name||'—';
renderLedger(list,d.students,role);
renderTeam();
$('clinicalRows').innerHTML=rows.clinical_records.map(r=>`<article class="card"><h3>${esc(r.kind)} · ${esc(name(r.student_id))}</h3><small>${esc(r.recorded_on)} · ${esc(d.professionals.find(p=>p.user_id===r.professional_id)?.name||'Administrador')}</small><h4>Queixa e histórico</h4><p>${esc(r.complaint||'—')}</p><h4>Achados</h4><p>${esc(r.findings||'—')}</p><h4>Conduta / plano</h4><p>${esc(r.plan)}</p><button type="button" class="secondary" data-print-clinical="${esc(r.id)}">Imprimir atendimento</button></article>`).join('')||'<p>Nenhum registro clínico disponível.</p>';
$('partnerRows').innerHTML=['Wellhub','TotalPass'].map(p=>{const r=rows.partner_connections.find(r=>r.partner===p);return `<article class="card"><h3>${p}</h3><strong>Conexão pendente</strong><p>Identificação: ${esc(r?.clinic_identifier||'Não cadastrada')}</p><p>${esc(r?.notes||'Aguardando credenciamento e acessos oficiais.')}</p></article>`;}).join('');}
const ledgerPageSize=12;
let ledgerKind='expense',ledgerPage=0;
function renderLedger(entries,students,role){
 const expense=ledgerKind==='expense';
 const names=new Map(students.map(student=>[student.id,student]));
 const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const query=normalize($('ledgerSearch').value.trim());
 const date=r=>r.settlement_status==='pending'?(r.settlement_due_on||r.paid_on):r.paid_on;
 const formatDate=value=>esc(value.split('-').reverse().join('/'));
 const matching=entries.filter(r=>{
  if(r.kind!==ledgerKind)return false;
  const student=names.get(r.student_id);
  return normalize([r.description,r.method,student?.name,categoryLabels.get(r.category)].join(' ')).includes(query);
 }).sort((a,b)=>{
  const pendingA=a.settlement_status==='pending',pendingB=b.settlement_status==='pending';
  if(expense&&pendingA!==pendingB)return Number(pendingB)-Number(pendingA);
  const order=expense&&pendingA?date(a).localeCompare(date(b)):date(b).localeCompare(date(a));
  return order||a.id.localeCompare(b.id);
 });
 ledgerPage=Math.min(ledgerPage,Math.max(0,Math.ceil(matching.length/ledgerPageSize)-1));
 const offset=ledgerPage*ledgerPageSize;
 const columns=expense?['Data','Descrição','Categoria','Valor']:['Data','Origem','Descrição','Valor'];
 $('ledgerHead').innerHTML='<tr>'+columns.map(label=>'<th scope="col">'+label+'</th>').join('')+'</tr>';
 $('ledgerRows').innerHTML=matching.slice(offset,offset+ledgerPageSize).map(r=>{
  const pending=r.settlement_status==='pending';
  const status=pending?'Em aberto':esc(r.method)+(r.method==='Cartão'?' · '+(r.installments||1)+'x':'');
  const competence=r.competence_month&&r.competence_month.slice(0,7)!==date(r).slice(0,7)?
   '<br><small>Competência '+esc(r.competence_month.slice(0,7).split('-').reverse().join('/'))+'</small>':'';
  const description='<td>'+esc(r.description)+'<br><small>'+status+'</small>'+competence+'</td>';
  const person=names.get(r.student_id);
  const detail=expense?description+'<td>'+esc(categoryLabels.get(r.category)??r.category)+'</td>':
   '<td>'+esc(otherIncomeCategories.get(r.category)||person?.name||'—')+(person?.activity?'<br><small>'+esc(person.activity)+'</small>':'')+'</td>'+description;
  const settle=role==='admin'&&expense&&pending?
   '<br><button type="button" class="secondary" data-settle-expense="'+esc(r.id)+'">Registrar pagamento</button>':'';
  return '<tr><td>'+(expense&&pending?'Vence em ':'')+formatDate(date(r))+'</td>'+detail+
   '<td>'+money(r.amount)+settle+'</td></tr>';
 }).join('')||'<tr><td colspan="4">'+(expense?'Nenhuma despesa encontrada.':'Nenhum pagamento encontrado.')+'</td></tr>';
 $('ledgerPageInfo').textContent=matching.length?(offset+1)+'–'+Math.min(offset+ledgerPageSize,matching.length)+' de '+matching.length:'0 registros';
 $('ledgerPrevious').disabled=ledgerPage===0;
 $('ledgerNext').disabled=offset+ledgerPageSize>=matching.length;
}
function selectLedger(kind){
 ledgerKind=kind;
 ledgerPage=0;
 const expense=kind==='expense';
 for(const [id,active] of [['expenseLedgerTab',expense],['paymentLedgerTab',!expense]]){
  $(id).setAttribute('aria-pressed',String(active));
  $(id).classList.toggle('secondary',!active);
 }
 $('ledgerSearch').value='';
 $('ledgerSearch').placeholder=expense?'Buscar despesa ou categoria':'Buscar aluno, paciente, categoria ou descrição';
 render();
}
$('expenseLedgerTab').onclick=()=>selectLedger('expense');
$('paymentLedgerTab').onclick=()=>selectLedger('income');
$('ledgerSearch').oninput=()=>{ledgerPage=0;render();};
$('ledgerActivity').onchange=()=>{
 const filtered=Boolean($('ledgerActivity').value);
 $('expenseLedgerTab').classList.toggle('hidden',filtered);
 selectLedger(filtered?'income':'expense');
};
$('ledgerPrevious').onclick=()=>{ledgerPage=Math.max(0,ledgerPage-1);render();};
$('ledgerNext').onclick=()=>{ledgerPage++;render();};
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
$('financeMonth').onchange=()=>{ledgerPage=0;render();};
const ledgerForm=$('ledgerForm');
function updateLedgerFields(){
 const linkedPayment=kind==='income'&&incomeCategory.value==='pagamento';
 $('paymentStudentLabel').classList.toggle('hidden',!linkedPayment);
 $('paymentStudent').disabled=!linkedPayment;
 $('paymentStudent').required=linkedPayment;
 const patient=linkedPayment&&currentData().students.find(student=>student.id===$('paymentStudent').value);
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
 const expense=kind==='expense',pending=expense&&ledgerForm.elements.settlement_status.value==='pending';
 for(const [label,name,visible,required] of [
  ['expenseCompetenceLabel','competence_month',true,true],
  ['expenseDueLabel','settlement_due_on',expense,pending],
  ['expenseStatusLabel','settlement_status',expense,expense],
  ['ledgerPaidDateLabel','paid_on',!pending,!pending]
 ]){
  $(label).classList.toggle('hidden',!visible);
  ledgerForm.elements[name].disabled=!visible;
  ledgerForm.elements[name].required=required;
 }
 ledgerForm.elements.paid_on.max=expense?day(new Date()):'';
 ledgerForm.elements.description.required=!physio;
 ledgerForm.elements.description.maxLength=physio?130:200;
}
function openLedger(k,patient=null,expense=null){
 kind=k;
 settlingExpense=expense;
 ledgerForm.reset();
 $('ledgerTitle').textContent=k==='income'?(patient?'Lançar pagamento':'Lançar receita'):'Lançar despesa';
 $('incomeCategoryLabel').classList.toggle('hidden',k==='expense'||Boolean(patient));
 incomeCategory.disabled=k==='expense';
 $('expenseCategoryLabel').classList.toggle('hidden',k==='income');
 if(patient){
  const picker=$('paymentStudent');
  if(![...picker.options].some(option=>option.value===patient.id)){
   picker.add(new Option(patient.name,patient.id));
  }
  picker.value=patient.id;
  if(patient.payment_method)ledgerForm.elements.method.value=patient.payment_method;
  if(!ledgerForm.elements.method.value)ledgerForm.elements.method.value='Pix';
  ledgerForm.elements.installments.value=patient.payment_installments||1;
 }
 ledgerForm.elements.paid_on.value=day(new Date());
 ledgerForm.elements.competence_month.value=(!patient&&$('financeMonth').value)||day(new Date()).slice(0,7);
 if(expense){
  $('ledgerTitle').textContent='Registrar pagamento da despesa';
  for(const key of ['description','amount','category','method','settlement_due_on'])ledgerForm.elements[key].value=expense[key]||'';
  ledgerForm.elements.competence_month.value=(expense.competence_month||expense.paid_on).slice(0,7);
  ledgerForm.elements.settlement_status.value='received';
 }
 updateLedgerFields();
 $('ledgerDialog').showModal();
}
$('paymentStudent').onchange=updateLedgerFields;
incomeCategory.onchange=updateLedgerFields;
ledgerForm.elements.method.onchange=updateLedgerFields;
ledgerForm.elements.settlement_status.onchange=updateLedgerFields;
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-settle-expense]');
 if(!button||currentStaff()?.role!=='admin')return;
 const expense=rows.ledger.find(row=>row.id===button.dataset.settleExpense&&row.kind==='expense'&&row.settlement_status==='pending');
 if(expense)openLedger('expense',null,expense);
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-student-payment]');
 if(!button||currentStaff()?.role!=='admin')return;
 const linkedPayment=kind==='income'&&incomeCategory.value==='pagamento';
 $('paymentStudentLabel').classList.toggle('hidden',!linkedPayment);
 $('paymentStudent').disabled=!linkedPayment;
 $('paymentStudent').required=linkedPayment;
 const patient=linkedPayment&&currentData().students.find(student=>student.id===button.dataset.studentPayment&&student.active);
 if(!patient)return;
 button.closest('dialog')?.close();
 openLedger('income',patient);
});
$('newPayment').onclick=()=>openLedger('income');$('newExpense').onclick=()=>openLedger('expense');$('newTeam').onclick=()=>{$('teamForm').reset();$('teamForm').elements.username.readOnly=false;$('teamForm').elements.password.required=true;$('teamDialog').showModal();};$('newClinical').onclick=()=>{$('clinicalForm').elements.recorded_on.value=today;$('clinicalDialog').showModal();};
async function submit(form,action,dialog,message){form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await action(Object.fromEntries(new FormData(form)));await load();if(dialog)$(dialog).close();form.reset();notify(message);}catch(e){notify(e.message);}finally{button.disabled=false;}};}
submit(ledgerForm,async ({income_category,physio_mode,physio_sessions,installments,competence_month,settlement_due_on,settlement_status,...d})=>{
 const detail=physio_mode?`Fisioterapia · ${physio_mode} · ${physio_sessions} sessão(ões)`:'';
 const description=[detail,d.description.trim()].filter(Boolean).join(' · ');
 const payload={...d,description,kind,amount:Number(d.amount),installments:Number(installments||1),
  student_id:kind==='income'&&income_category==='pagamento'?d.student_id:null,category:kind==='income'?income_category:d.category,competence_month:competence_month+'-01'};
 if(kind==='expense'){
  Object.assign(payload,{settlement_due_on:settlement_due_on||null,settlement_status,
   paid_on:settlement_status==='pending'?settlement_due_on:d.paid_on,
   settled_on:settlement_status==='pending'?null:d.paid_on});
 }
 const path='/rest/v1/ledger'+(settlingExpense?'?id=eq.'+settlingExpense.id+'&kind=eq.expense&settlement_status=eq.pending':'');
 const result=await api(path,{method:settlingExpense?'PATCH':'POST',body:JSON.stringify(payload)});
 if(settlingExpense&&!result?.length)throw Error('Esta despesa já foi atualizada. Recarregue o Financeiro.');
 $('financeMonth').value=competence_month;
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
