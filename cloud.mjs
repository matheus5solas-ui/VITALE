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
 $('appointments').innerHTML=data.appointments.filter(a=>day(a.starts_at)===$('date').value).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(a=>`<tr><td>${new Date(a.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'})}</td><td>${esc(name(a.student_id))}</td><td>${esc(a.activity)}</td><td>${esc(data.professionals.find(p=>p.user_id===a.professional_id)?.name||'Profissional')}</td><td>${esc({scheduled:'Agendado',present:'Presente',cancelled:'Cancelado',completed:'Concluído',absent:'Falta'}[a.status])}</td><td>${a.status==='scheduled'?`<button data-present="${a.id}">Confirmar presença</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhum agendamento nesta data.</td></tr>';
 $('studentRows').innerHTML=data.students.filter(s=>s.name.toLowerCase().includes($('search').value.toLowerCase())).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.phone)}</td><td>${studentAge(s.birth_date)}</td><td>${esc(s.activity)}</td><td><button data-edit-student="${s.id}">Ver / editar cadastro</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum aluno disponível para seu perfil.</td></tr>';
 $('attendanceRows').innerHTML=[...data.attendance].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map(a=>`<tr><td>${esc(name(a.student_id))}</td><td>${new Date(a.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}</td><td>${a.source==='facial'?'Facial':'Manual'}</td><td>${a.appointment_id?'Aula vinculada':'Conferir'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhuma presença.</td></tr>';
 $('appointmentStudent').innerHTML='<option value="">Selecione</option>'+data.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 $('professional').innerHTML='<option value="">Selecione</option>'+data.professionals.filter(p=>p.active).map(p=>`<option value="${p.user_id}">${esc(p.name)}</option>`).join('');
 $('appointmentStudent').value=selectedStudent;$('professional').value=selectedProfessional;
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.roles&&!b.dataset.roles.split(',').includes(staff?.role))return;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));['agenda','students','attendance','face','finance','team','clinical','partners'].forEach(id=>$(id).classList.toggle('hidden',id!==b.dataset.view));$('title').textContent=b.textContent;});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('newStudent').onclick=()=>{openStudent();};
$('newAppointment').onclick=()=>{if(!data.students.length)return notify('Cadastre um aluno primeiro.');if(!data.professionals.some(p=>p.active))return notify('Cadastre os profissionais autorizados antes de agendar.');$('appointmentForm').elements.day.value=$('date').value;$('appointmentDialog').showModal();};
$('studentForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const d=Object.fromEntries(new FormData(e.target));if(!d.name.trim())throw Error('Informe o nome.');if(d.birth_date&&(d.birth_date>day(new Date())||d.birth_date<'1900-01-01'))throw Error('Confira a data de nascimento.');const body={name:d.name.trim(),phone:d.phone.trim()||null,activity:d.activity,birth_date:d.birth_date||null,address:d.address.trim()||null,health_conditions:d.health_conditions.trim()||null,pilates_reason:d.activity==='Pilates'?(d.pilates_reason.trim()||null):null};await api('/rest/v1/students'+(d.id?'?id=eq.'+encodeURIComponent(d.id):''),{method:d.id?'PATCH':'POST',body:JSON.stringify(body)});await reload();e.target.reset();$('studentDialog').close();notify(d.id?'Cadastro atualizado.':'Aluno salvo no banco.');}catch(err){notify(err.message);}finally{button.disabled=false;}};
$('appointmentForm').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));const start=new Date(`${d.day}T${d.time}:00-03:00`);await api('/rest/v1/appointments',{method:'POST',body:JSON.stringify({student_id:d.studentId,professional_id:d.professional,starts_at:start.toISOString(),ends_at:new Date(+start+3600000).toISOString(),activity:d.activity})});await reload();e.target.reset();$('appointmentDialog').close();notify('Agendamento salvo.');}catch(err){notify(err.message);}};
document.addEventListener('click',async e=>{const id=e.target.dataset.present;if(!id)return;const a=data.appointments.find(a=>a.id===id);e.target.disabled=true;try{await api('/rest/v1/attendance',{method:'POST',body:JSON.stringify({student_id:a.student_id,appointment_id:a.id,occurred_at:new Date().toISOString(),source:'manual',recorded_by:staff.user_id})});await reload();notify('Presença confirmada.');}catch(err){notify(err.message);}finally{e.target.disabled=false;}});
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
function updateStudentFields(){$('pilatesReasonLabel').classList.toggle('hidden',$('studentActivity').value!=='Pilates');$('studentAge').textContent=$('studentBirthDate').value?studentAge($('studentBirthDate').value):'Idade calculada pela data de nascimento.';}
function openStudent(student=null){if(staff?.role==='professional')return;const form=$('studentForm');form.reset();if(student)for(const field of ['id','name','phone','activity','birth_date','address','health_conditions','pilates_reason'])form.elements[field].value=student[field]||'';$('studentDialogTitle').textContent=student?'Editar aluno ou paciente':'Cadastrar aluno ou paciente';$('studentBirthDate').max=day(new Date());updateStudentFields();$('studentDialog').showModal();}
$('studentActivity').onchange=updateStudentFields;$('studentBirthDate').oninput=updateStudentFields;
document.addEventListener('click',e=>{const button=e.target.closest('[data-edit-student]');if(!button)return;const student=data.students.find(s=>s.id===button.dataset.editStudent);if(student)openStudent(student);});
