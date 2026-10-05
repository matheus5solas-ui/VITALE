export function recordPresence(state, {studentId, occurredAt, source, eventId}) {
  const student=state.students.find(s=>s.id===studentId);
  if(!student) throw new Error('Aluno não encontrado.');
  const instant=new Date(occurredAt);
  if(!Number.isFinite(instant.getTime())) throw new Error('Horário inválido.');
  if(source==='facial'&&!student.faceId) throw new Error('Vincule primeiro o ID do aluno no aparelho.');
  if(eventId&&state.attendance.some(a=>a.eventId===eventId)) return {duplicate:true};
  const candidates=state.appointments.filter(a=>a.studentId===studentId&&a.status!=='cancelled'&&Math.abs(new Date(a.startsAt)-instant)<=60*60*1000);
  candidates.sort((a,b)=>Math.abs(new Date(a.startsAt)-instant)-Math.abs(new Date(b.startsAt)-instant));
  const appointment=candidates[0];
  if(appointment&&state.attendance.some(a=>a.appointmentId===appointment.id)) return {duplicate:true};
  const last=state.attendance.find(a=>a.studentId===studentId&&Math.abs(new Date(a.occurredAt)-instant)<5*60*1000);
  if(last) return {duplicate:true};
  const entry={id:crypto.randomUUID(),studentId,occurredAt:instant.toISOString(),source,eventId:eventId||null,appointmentId:appointment?.id||null};
  state.attendance.push(entry);
  if(appointment) appointment.status='present';
  return {entry,requiresReview:!appointment};
}
