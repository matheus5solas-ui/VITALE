import {api,esc,day,notify} from './cloud.mjs';
import {currentStaff,currentData} from './cloud.mjs';

const CONDITIONS=[
 ['escoliose','Escoliose'],['arritmia','Arritmia'],['dor_coluna','Dor na coluna'],
 ['hernia_disco','Hérnia de disco'],['hipertensao','Hipertensão'],
 ['osteoporose','Osteoporose'],['artrose','Artrose'],['diabetes','Diabetes'],
 ['limitacao_mobilidade','Limitação de mobilidade'],['cirurgia_recente','Cirurgia recente']
];
const REGIONS=[
 ['superiores','Membros superiores'],['inferiores','Membros inferiores'],
 ['coluna_core','Coluna e core'],['corpo_inteiro','Corpo inteiro'],
 ['mobilidade','Mobilidade e alongamento'],['respiratorio','Respiratório'],
 ['outros','Outros']
];
const dialog=document.createElement('dialog');
dialog.id='trainingSheetDialog';
dialog.style.cssText='width:min(820px,96vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #dce6df;border-radius:16px';
document.body.append(dialog);
const label=(v)=>REGIONS.find(x=>x[0]===v)?.[1]||v;
let currentStudent=null;
async function openSheet(studentId){
 const staff=currentStaff(),data=currentData();
 const student=data.students.find(s=>s.id===studentId&&s.active);
 if(!student||!['admin','professional'].includes(staff?.role))return;
 if(staff.role==='professional'&&student.responsible_professional_id!==staff.user_id){notify('A ficha só está disponível para o profissional responsável.');return;}
 currentStudent=studentId;
 dialog.innerHTML='<h2>Ficha técnica de treino</h2><p><strong>'+esc(student.name)+'</strong> · '+esc(student.student_code||'')+'</p><p><small>Registre somente informações relevantes para o atendimento. Condições marcadas devem ser confirmadas pelo profissional; não representam diagnóstico automático.</small></p><p id="trainingLoading">Carregando histórico…</p><button type="button" class="secondary" id="trainingClose">Fechar</button>';
 dialog.querySelector('#trainingClose').onclick=()=>dialog.close();
 dialog.showModal();
 try{
  const rows=await api('/rest/v1/student_training_logs?select=*&student_id=eq.'+encodeURIComponent(studentId)+'&order=session_date.desc,created_at.desc&limit=80');
  if(currentStudent!==studentId||!dialog.open)return;
  const history=rows.map(r=>'<article style="padding:12px 0;border-bottom:1px solid #e1e7e4"><strong>'+esc(r.session_date.split('-').reverse().join('/'))+' · '+esc(label(r.region))+'</strong><p>'+esc(r.activities||'Sem exercícios detalhados')+'</p>'+(r.conditions?.length?'<p><small>Condições assinaladas: '+r.conditions.map(k=>esc(CONDITIONS.find(c=>c[0]===k)?.[1]||k)).join(', ')+'</small></p>':'')+(r.observations?'<p><small>Observações: '+esc(r.observations)+'</small></p>':'')+'</article>').join('')||'<p>Nenhum treino registrado ainda.</p>';
  dialog.innerHTML='<h2>Ficha técnica de treino</h2><p><strong>'+esc(student.name)+'</strong> · Código '+esc(student.student_code||'')+'</p><p><small>Informações clínicas confidenciais. As marcações registram informações relatadas ou avaliadas pelo profissional e não constituem diagnóstico automático.</small></p>'+
  '<form id="trainingForm"><label>Data da sessão <input name="session_date" type="date" value="'+esc(day(new Date()))+'" required></label>'+
  '<label>Região trabalhada <select name="region" required>'+REGIONS.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>'+
  '<label>Exercícios e atividades realizados <textarea name="activities" rows="3" maxlength="4000" required placeholder="Ex.: ponte, fortalecimento de membros inferiores, 3 séries de 10 repetições"></textarea></label>'+
  '<fieldset style="margin:16px 0;padding:12px;border:1px solid #dce6df;border-radius:10px"><legend>Condições e cuidados identificados</legend><p><small>Marque apenas o que foi confirmado no atendimento.</small></p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">'+CONDITIONS.map(([v,t])=>'<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="condition" value="'+v+'"> '+esc(t)+'</label>').join('')+'</div></fieldset>'+
  '<label>Observações, adaptações, sintomas ou orientações <textarea name="observations" rows="3" maxlength="4000" placeholder="Ex.: redução de carga, desconforto relatado, resposta à sessão"></textarea></label>'+
  '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0"><button type="submit" id="trainingSave">Salvar sessão</button><button type="button" class="secondary" id="trainingClose">Fechar</button></div></form>'+
  '<h3>Histórico de treinos</h3><div id="trainingHistory">'+history+'</div>';
  dialog.querySelector('#trainingClose').onclick=()=>dialog.close();
  dialog.querySelector('#trainingForm').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,save=form.querySelector('#trainingSave'),fd=new FormData(form);
   save.disabled=true;
   try{
    await api('/rest/v1/student_training_logs',{method:'POST',body:JSON.stringify({
     student_id:studentId,professional_id:staff.user_id,session_date:fd.get('session_date'),
     region:fd.get('region'),activities:String(fd.get('activities')||'').trim(),
     observations:String(fd.get('observations')||'').trim(),conditions:fd.getAll('condition')
    })});
    notify('Ficha técnica salva com sucesso.');
    dialog.close();await openSheet(studentId);
   }catch(error){notify(error.message||'Não foi possível salvar a ficha.');save.disabled=false;}
  };
 }catch(error){
  dialog.querySelector('#trainingLoading').textContent='Não foi possível carregar a ficha: '+error.message;
 }
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-training-student]');
 if(button)openSheet(button.dataset.trainingStudent);
});
