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
dialog.style.cssText='width:min(860px,96vw);max-height:90vh;overflow:auto;padding:clamp(16px,3vw,28px);border:1px solid #dce6df;border-radius:16px;box-shadow:0 20px 60px #173d3333';
document.body.append(dialog);
const trainingStyles=document.createElement('style');
trainingStyles.textContent=`
#trainingSheetDialog::backdrop{background:rgba(12,35,27,.52)}
#trainingSheetDialog h2{margin:0 0 8px;color:#173d33;font-size:23px}
#trainingSheetDialog .training-intro{color:#52675e;line-height:1.5;margin:10px 0 20px}
#trainingSheetDialog #trainingForm{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:18px!important;max-width:none!important}
#trainingSheetDialog #trainingForm .training-field{display:flex!important;flex-direction:column!important;gap:8px!important;margin:0!important;min-width:0;font-weight:600;font-size:13px;color:#29483d}
#trainingSheetDialog #trainingForm .training-field input,#trainingSheetDialog #trainingForm .training-field select,#trainingSheetDialog #trainingForm .training-field textarea{width:100%;min-width:0;margin:0;font-weight:400;font-size:14px}
#trainingSheetDialog #trainingForm .training-wide{grid-column:1/-1}
#trainingSheetDialog #trainingForm textarea{min-height:110px;resize:vertical}
#trainingSheetDialog #trainingForm .training-conditions{min-width:0;margin:0;padding:16px;border:1px solid #dce6df;border-radius:10px}
#trainingSheetDialog #trainingForm .training-conditions legend{font-weight:600;padding:0 6px}
#trainingSheetDialog .training-condition-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}
#trainingSheetDialog #trainingForm .training-check{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:9px!important;margin:0!important;min-width:0;text-align:left!important;font-weight:400;font-size:13px;line-height:1.4;cursor:pointer}
#trainingSheetDialog #trainingForm .training-check input{appearance:auto!important;width:16px!important;height:16px!important;flex:0 0 16px!important;margin:0!important;padding:0!important;accent-color:#24664d}
#trainingSheetDialog .training-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0}
#trainingSheetDialog .training-error{color:#a52828;font-size:13px}
#trainingSheetDialog .training-history{margin-top:22px;border-top:1px solid #dce6df;padding-top:16px}
@media(max-width:650px){#trainingSheetDialog #trainingForm{grid-template-columns:minmax(0,1fr)!important}#trainingSheetDialog .training-condition-grid{grid-template-columns:minmax(0,1fr)}}
`;
document.head.append(trainingStyles);
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
  '<form id="trainingForm"><label class="training-field">Data da sessão <input name="session_date" type="date" value="'+esc(day(new Date()))+'" required></label>'+
  '<label class="training-field">Região trabalhada <select name="region" required>'+REGIONS.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>'+
  '<label class="training-field training-wide">Exercícios e atividades realizados <textarea name="activities" rows="3" maxlength="4000" required placeholder="Ex.: ponte, fortalecimento de membros inferiores, 3 séries de 10 repetições"></textarea></label>'+
  '<fieldset class="training-conditions training-wide"><legend>Condições e cuidados identificados</legend><p><small>Marque apenas o que foi confirmado no atendimento.</small></p><div class="training-condition-grid">'+CONDITIONS.map(([v,t])=>'<label class="training-check"><input type="checkbox" name="condition" value="'+v+'"> '+esc(t)+'</label>').join('')+'</div></fieldset>'+
  '<label class="training-field training-wide">Observações, adaptações, sintomas ou orientações <textarea name="observations" rows="3" maxlength="4000" placeholder="Ex.: redução de carga, desconforto relatado, resposta à sessão"></textarea></label>'+
  '<div class="training-actions training-wide"><button type="submit" id="trainingSave">Salvar sessão</button><button type="button" class="secondary" id="trainingClose">Fechar</button><span class="training-error" id="trainingSaveError" role="alert"></span></div></form>'+
  '<section class="training-history"><h3>Histórico de treinos</h3><div id="trainingHistory">'+history+'</div></section>';
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
   }catch(error){const message=error.message||'Não foi possível salvar a ficha.';dialog.querySelector('#trainingSaveError').textContent=message;notify(message);save.disabled=false;}
  };
 }catch(error){
  dialog.querySelector('#trainingLoading').textContent='Não foi possível carregar a ficha: '+error.message;
 }
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-training-student]');
 if(button)openSheet(button.dataset.trainingStudent);
});
