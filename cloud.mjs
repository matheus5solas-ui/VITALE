import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
const $=id=>document.getElementById(id);
let session=null,staff=null,data={students:[],appointments:[],attendance:[],professionals:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
const today=day(new Date());$('date').value=today;
const notify=s=>$('message').textContent=s;
const sessionKey='vitale.session';
let refreshing=null,polling=false;
function saveSession(result){session={access_token:result.access_token,refresh_token:result.refresh_token,user:result.user,expires_at:Date.now()/1000+result.expires_in};try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}}
async function refreshSession(){
 if(refreshing)return refreshing;
 if(!session?.refresh_token){logout();throw Error('Entre novamente para continuar.');}
 const original=session;
 refreshing=(async()=>{const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:original.refresh_token}),signal:AbortSignal.timeout(12000)});
 if(!r.ok){if([400,401,403].includes(r.status))logout();throw Error('Não foi possível renovar a sessão. Tente novamente.');}
 const result=await r.json();if(session!==original)throw Error('Sessão encerrada.');saveSession(result);
 })();try{await refreshing;}finally{refreshing=null;}
}
async function enterWorkspace(){
 const rows=await api('/rest/v1/staff?select=user_id,name,role,active');staff=rows.find(x=>x.user_id===session?.user.id);
 if(!staff?.active){logout();throw Error('Seu acesso à clínica ainda não foi habilitado.');}
 $('loginPanel').classList.add('hidden');$('workspace').classList.remove('hidden');$('identity').textContent=staff.name+' · '+({admin:'Administrador',reception:'Recepção',professional:'Profissional'}[staff.role]);
 $('newStudent').classList.toggle('hidden',staff.role==='professional');$('newAppointment').classList.toggle('hidden',staff.role==='professional');applyRoles();await reload();
}

async function api(path,options={},retry=true){
 if(!session){throw Error('Entre novamente para continuar.');}
 if(session.expires_at<=Date.now()/1000+60)await refreshSession();
 const response=await fetch(SUPABASE_URL+path,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(12000)});
 if(response.status===401){if(retry){await refreshSession();return api(path,options,false);}logout();throw Error('Sua sessão expirou. Entre novamente.');}
 if(!response.ok&&path.startsWith('/functions/')){const error=await response.json().catch(()=>({}));throw Error(error.message||'Não foi possível concluir esta operação.');}
 if(!response.ok&&path.startsWith('/rest/v1/attendance')){const error=await response.json().catch(()=>({}));throw Error(error.code==='23505'?'Esta aula já tem presença registrada.':error.message?.includes('Pacote')?error.message:'Não foi possível confirmar a presença. Confira o agendamento e o saldo.');}
 if(!response.ok)throw Error(response.status===403?'Seu perfil não permite esta ação.':response.status===409?'Já existe um registro com esses dados.':'Não foi possível salvar ou carregar. Tente novamente.');
 return response.status===204?null:response.json();
}
function logout(){try{sessionStorage.removeItem(sessionKey);}catch{}session=null;staff=null;data={students:[],appointments:[],attendance:[],professionals:[]};$('loginPanel').classList.remove('hidden');$('workspace').classList.add('hidden');$('password').value='';$('studentForm').reset();$('appointmentForm').reset();document.querySelectorAll('dialog[open]').forEach(d=>d.close());render();}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMessage').textContent='Entrando…';const password=$('password').value;try{
 const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Não foi possível entrar. Confira seu e-mail e senha.');
 const result=await r.json();saveSession(result);$('password').value='';await enterWorkspace();$('loginMessage').textContent='';
 }catch(err){$('loginMessage').textContent=err.message;}finally{$('password').value='';}};
$('logout').onclick=async()=>{try{if(session)await api('/auth/v1/logout',{method:'POST'});}catch{}finally{logout();}};
async function allRows(table,order="",select="*"){let result=[];for(let offset=0;;offset+=1000){const page=await api(`/rest/v1/${table}?select=${select}&limit=1000&offset=${offset}${order?"&order="+order:""}`);result.push(...page);if(page.length<1000)return result;}}
async function reload(){const userId=session?.user.id;const result=await Promise.all(['students','appointments','attendance','professionals'].map(t=>allRows(t)));if(!session||session.user.id!==userId)return;['students','appointments','attendance','professionals'].forEach((t,i)=>data[t]=result[i]);render();window.dispatchEvent(new Event('vitale:refresh'));}
const name=id=>data.students.find(s=>s.id===id)?.name||'Aluno';
function render(){
 const selectedStudent=$('appointmentStudent').value,selectedProfessional=$('professional').value;
 $('countStudents').textContent=data.students.length;$('countAppointments').textContent=data.appointments.filter(a=>day(a.starts_at)===today).length;$('countAttendance').textContent=data.attendance.filter(a=>day(a.occurred_at)===today).length;
 $('appointments').innerHTML=data.appointments.filter(a=>day(a.starts_at)===$('date').value).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(a=>`<tr><td>${new Date(a.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'})}</td><td><button class="secondary" data-view-student="${a.student_id}">${esc(name(a.student_id))}</button></td><td>${esc(a.activity)}</td><td>${esc(data.professionals.find(p=>p.user_id===a.professional_id)?.name||'Profissional')}</td><td>${esc({scheduled:'Agendado',present:'Presente',cancelled:'Cancelado',completed:'Concluído',absent:'Falta'}[a.status])}</td><td>${a.status==='scheduled'?`<button data-present="${a.id}">Confirmar presença</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhum agendamento nesta data.</td></tr>';
 $('studentRows').innerHTML=data.students.filter(s=>s.name.toLowerCase().includes($('search').value.toLowerCase())).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.phone)}</td><td>${studentAge(s.birth_date)}</td><td>${esc(s.activity)}</td><td><button class="secondary" data-view-student="${s.id}">Ver informações</button> ${staff?.role!=='professional'?`<button data-edit-student="${s.id}">Editar</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum aluno disponível para seu perfil.</td></tr>';
 $('attendanceRows').innerHTML=[...data.attendance].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map(a=>`<tr><td>${esc(name(a.student_id))}</td><td>${new Date(a.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}</td><td>${a.source==='facial'?'Facial':'Manual'}</td><td>${a.appointment_id?'Aula vinculada':'Conferir'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhuma presença.</td></tr>';
 $('appointmentStudent').innerHTML='<option value="">Selecione</option>'+data.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 $('professional').innerHTML='<option value="">Selecione</option>'+data.professionals.filter(p=>p.active).map(p=>`<option value="${p.user_id}">${esc(p.name)}</option>`).join('');
 $('appointmentStudent').value=selectedStudent;$('professional').value=selectedProfessional;renderClasses();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.roles&&!b.dataset.roles.split(',').includes(staff?.role))return;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));['agenda','classes','students','attendance','face','finance','team','clinical','partners'].forEach(id=>$(id).classList.toggle('hidden',id!==b.dataset.view));$('title').textContent=b.textContent;});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('newStudent').onclick=()=>{openStudent();};
$('newAppointment').onclick=()=>{if(!data.students.length)return notify('Cadastre um aluno primeiro.');if(!data.professionals.some(p=>p.active))return notify('Cadastre os profissionais autorizados antes de agendar.');$('appointmentForm').elements.day.value=$('date').value;$('appointmentDialog').showModal();};
$('studentForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const d=Object.fromEntries(new FormData(e.target));if(!d.name.trim())throw Error('Informe o nome.');if(d.birth_date&&(d.birth_date>day(new Date())||d.birth_date<'1900-01-01'))throw Error('Confira a data de nascimento.');const body={name:d.name.trim(),phone:d.phone.trim()||null,activity:d.activity,birth_date:d.birth_date||null,address:d.address.trim()||null,health_conditions:d.health_conditions.trim()||null,pilates_plan:d.activity==='Pilates'?(d.pilates_plan||null):null,pilates_reason:d.activity==='Pilates'?(d.pilates_reason.trim()||null):null};await api('/rest/v1/students'+(d.id?'?id=eq.'+encodeURIComponent(d.id):''),{method:d.id?'PATCH':'POST',body:JSON.stringify(body)});await reload();e.target.reset();$('studentDialog').close();notify(d.id?'Cadastro atualizado.':'Aluno salvo no banco.');}catch(err){notify(err.message);}finally{button.disabled=false;}};
$('appointmentForm').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));const start=new Date(`${d.day}T${d.time}:00-03:00`);await api('/rest/v1/appointments',{method:'POST',body:JSON.stringify({student_id:d.studentId,professional_id:d.professional,starts_at:start.toISOString(),ends_at:new Date(+start+3600000).toISOString(),activity:d.activity})});await reload();e.target.reset();$('appointmentDialog').close();notify('Agendamento salvo.');}catch(err){notify(err.message);}};
document.addEventListener('click',async e=>{const id=e.target.dataset.present;if(!id)return;const a=data.appointments.find(a=>a.id===id);if(!a)return;if(!confirm('Confirmar presença manual de '+name(a.student_id)+' nesta aula?'))return;e.target.disabled=true;try{await api('/rest/v1/attendance',{method:'POST',body:JSON.stringify({student_id:a.student_id,appointment_id:a.id,occurred_at:new Date().toISOString(),source:'manual',recorded_by:staff.user_id})});await reload();notify('Presença confirmada.');}catch(err){notify(err.message);}finally{e.target.disabled=false;}});
$('date').onchange=render;$('search').oninput=render;$('refresh').onclick=()=>reload().catch(e=>notify(e.message));
async function restoreSession(){
 try{const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(!saved?.access_token||!saved?.refresh_token||!saved?.user?.id)return;session=saved;$('loginMessage').textContent='Restaurando sessão…';await enterWorkspace();$('loginMessage').textContent='';}
 catch(err){$('loginMessage').textContent=err.message;}
}
setInterval(async()=>{
 if(!session||!staff||document.hidden||polling||document.querySelector('dialog[open]'))return;
 polling=true;try{const userId=session.user.id;const rows=await allRows('attendance');if(session?.user.id!==userId)return;data.attendance=rows;render();}catch(err){notify(err.message);}finally{polling=false;}
},5000);
restoreSession();

function applyRoles(){document.querySelectorAll('[data-roles]').forEach(el=>el.classList.toggle('hidden',!el.dataset.roles.split(',').includes(staff?.role)));document.querySelector('[data-view=agenda]').click();}
export {api,esc,day,today,notify,reload,allRows};
export const currentStaff=()=>staff;
export const currentData=()=>data;
import('./management.mjs');
window.addEventListener('vitale:team',()=>reload().catch(e=>notify(e.message)));

function studentAge(birth){if(!birth)return '—';const [y,m,d]=birth.split('-').map(Number),[ty,tm,td]=day(new Date()).split('-').map(Number);return `${ty-y-((tm<m||tm===m&&td<d)?1:0)} anos`;}
function updateStudentFields(){$('pilatesPlanLabel').classList.toggle('hidden',$('studentActivity').value!=='Pilates');$('pilatesReasonLabel').classList.toggle('hidden',$('studentActivity').value!=='Pilates');$('studentAge').textContent=$('studentBirthDate').value?studentAge($('studentBirthDate').value):'Idade calculada pela data de nascimento.';}
function openStudent(student=null){if(staff?.role==='professional')return;const form=$('studentForm');form.reset();if(student)for(const field of ['id','name','phone','activity','birth_date','address','health_conditions','pilates_reason','pilates_plan'])form.elements[field].value=student[field]||'';$('studentDialogTitle').textContent=student?'Editar aluno ou paciente':'Cadastrar aluno ou paciente';$('studentBirthDate').max=day(new Date());updateStudentFields();const used=student?.test_plan_started_at?data.attendance.filter(a=>a.student_id===student.id&&a.appointment_id&&a.occurred_at>=student.test_plan_started_at).length:0;$('planStatus').textContent=student?.pilates_plan==='test_2'?`Teste: ${Math.max(0,2-used)} de 2 aulas disponíveis.`:'Escolha o plano contratado. O teste conta duas aulas agendadas.';$('studentDialog').showModal();}
$('studentActivity').onchange=updateStudentFields;$('studentBirthDate').oninput=updateStudentFields;
document.addEventListener('click',e=>{const button=e.target.closest('[data-edit-student]');if(!button)return;const student=data.students.find(s=>s.id===button.dataset.editStudent);if(student)openStudent(student);});

const studentInfoDialog=document.createElement('dialog');
studentInfoDialog.id='studentInfoDialog';
studentInfoDialog.style.width='min(720px,95vw)';
document.body.append(studentInfoDialog);
function showStudentInfo(student){
 const plans={monthly_1:'Mensal · 1x por semana · R$ 140,00',monthly_2:'Mensal · 2x por semana · R$ 160,00',monthly_3:'Mensal · 3x por semana · R$ 190,00',test_2:'Teste · pacote de 2 aulas'};
 const used=student.test_plan_started_at?data.attendance.filter(a=>a.student_id===student.id&&a.appointment_id&&a.occurred_at>=student.test_plan_started_at).length:0;
 const fields=[['Telefone',student.phone],['Data de nascimento',student.birth_date?student.birth_date.split('-').reverse().join('/'):''],['Idade',studentAge(student.birth_date)],['Atividade',student.activity],['Endereço',student.address],['Doenças ou condições informadas',student.health_conditions],...(student.activity==='Pilates'?[['Plano',plans[student.pilates_plan]||'Não definido'],['Motivo da procura',student.pilates_reason],...(student.pilates_plan==='test_2'?[['Aulas disponíveis',Math.max(0,2-used)+' de 2']]:[])]:[])];
 studentInfoDialog.innerHTML='<h2>'+esc(student.name)+'</h2><dl>'+fields.map(([label,value])=>'<dt style="font-weight:600;margin-top:16px">'+esc(label)+'</dt><dd style="margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(value||'Não informado')+'</dd>').join('')+'</dl><div style="display:flex;gap:12px;margin-top:24px">'+(staff?.role!=='professional'?'<button id="editStudentInfo">Editar cadastro</button>':'')+'<button class="secondary" id="closeStudentInfo">Fechar</button></div>';
 studentInfoDialog.querySelector('#closeStudentInfo').onclick=()=>studentInfoDialog.close();
 const edit=studentInfoDialog.querySelector('#editStudentInfo');if(edit)edit.onclick=()=>{studentInfoDialog.close();openStudent(student);};
 studentInfoDialog.showModal();
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-view-student]');if(!button)return;const student=data.students.find(s=>s.id===button.dataset.viewStudent);if(student)showStudentInfo(student);});

function classAttendance(student,current=true){return data.attendance.filter(t=>t.student_id===student.id&&t.appointment_id&&(!current||student.pilates_plan!=='test_2'||t.occurred_at>=student.test_plan_started_at));}
function teacher(a){return data.professionals.find(p=>p.user_id===a?.professional_id)?.name||'Professor não informado';}
function classAppointments(student){return data.appointments.filter(a=>a.student_id===student.id&&a.activity==='Pilates'&&a.status!=='cancelled'&&(student.pilates_plan==='test_2'?a.ends_at>=student.test_plan_started_at:day(a.starts_at).slice(0,7)===day(new Date()).slice(0,7))).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));}
function renderClasses(){
 const rows=data.students.filter(s=>s.active&&s.activity==='Pilates'&&s.name.toLowerCase().includes(($('classSearch')?.value||'').toLowerCase()));
 $('classRows').innerHTML=rows.map(s=>{
 const appointments=classAppointments(s), attendance=classAttendance(s), used=s.pilates_plan==='test_2'?attendance.length:appointments.filter(a=>attendance.some(t=>t.appointment_id===a.id)).length;
 const total=s.pilates_plan==='test_2'?2:appointments.length, exhausted=s.pilates_plan==='test_2'&&used>=total;
 const dots=Array.from({length:total},(_,i)=>'<span aria-label="Aula '+(i+1)+': '+(exhausted?'pacote esgotado':i<used?'presença confirmada':'disponível')+'" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:'+(exhausted?'#b42318':i<used?'#237b50':'#e0e5e3')+';color:'+(i<used||exhausted?'white':'#344840')+'">'+(i+1)+'</span>').join('');
 return '<article class="card" style="margin-bottom:20px"><div class="toolbar"><h3>'+esc(s.name)+'</h3><button class="secondary" data-print-classes="'+s.id+'">Imprimir histórico</button>'+(staff?.role!=='professional'&&s.pilates_plan==='test_2'?'<button data-renew-classes="'+s.id+'">Renovar pacote de teste</button>':'')+'</div><p>'+(s.pilates_plan==='test_2'?'Pacote de teste · 2 aulas':'Aulas agendadas no mês')+'</p><div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="Progresso das aulas">'+dots+'</div><p style="font-weight:600;color:'+(exhausted?'#b42318':'#174c39')+'">'+(exhausted?'Renovar matrícula — todas as aulas consumidas':used+' de '+total+' aulas com presença')+'</p><table><thead><tr><th>Aula</th><th>Professor vinculado</th><th>Presença</th><th>Ação</th></tr></thead><tbody>'+appointments.map(a=>{const t=attendance.find(t=>t.appointment_id===a.id);return '<tr><td>'+esc(new Date(a.starts_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}))+'</td><td>'+esc(teacher(a))+'</td><td>'+(t?esc(new Date(t.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}))+' · '+(t.source==='facial'?'Facial':'Manual'):'Pendente')+'</td><td>'+(!t&&a.status==='scheduled'&&!exhausted&&new Date(a.starts_at)<=new Date()?'<button data-present="'+a.id+'">Marcar presença manual</button>':'—')+'</td></tr>';}).join('')+'</tbody></table>'+(!total?'<p>Nenhuma aula agendada neste mês.</p>':'')+'</article>';
 }).join('')||'<p>Nenhum aluno de Pilates disponível.</p>';
}
$('classSearch').oninput=renderClasses;
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-print-classes]');if(!b)return;
 const s=data.students.find(s=>s.id===b.dataset.printClasses);if(!s)return;
 const rows=classAttendance(s,false).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));
 const popup=window.open('','_blank');if(!popup)return notify('Permita abrir a janela de impressão.');
 popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Presenças — '+esc(s.name)+'</title><style>body{font:14px Arial;margin:32px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:10px;text-align:left}</style></head><body><h1>Vitale · Histórico de presenças</h1><h2>'+esc(s.name)+'</h2><p>Professor vinculado ao agendamento. Presença não comprova atendimento concluído.</p><table><thead><tr><th>Aluno</th><th>Professor</th><th>Data e horário da presença</th><th>Origem</th></tr></thead><tbody>'+rows.map(t=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(teacher(data.appointments.find(a=>a.id===t.appointment_id)))+'</td><td>'+esc(new Date(t.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}))+'</td><td>'+(t.source==='facial'?'Facial':'Manual')+'</td></tr>').join('')+'</tbody></table></body></html>');
 popup.document.close();popup.focus();setTimeout(()=>popup.print(),300);
});

document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-renew-classes]');if(!b||staff?.role==='professional')return;
 const s=data.students.find(s=>s.id===b.dataset.renewClasses);if(!s)return;
 if(!confirm('Renovar o pacote de teste de '+s.name+' com 2 novas aulas? O histórico será preservado. Esta ação não lança pagamento.'))return;
 b.disabled=true;try{const rows=await api('/rest/v1/students?id=eq.'+s.id+'&plan_renewal_count=eq.'+s.plan_renewal_count,{method:'PATCH',body:JSON.stringify({plan_renewal_count:s.plan_renewal_count+1})});if(!rows?.length)throw Error('Cadastro atualizado por outra pessoa. Recarregue e confira.');await reload();notify('Pacote renovado. Agende as novas aulas; o conector sincronizará a liberação.');}catch(err){notify(err.message);}finally{b.disabled=false;}
});
