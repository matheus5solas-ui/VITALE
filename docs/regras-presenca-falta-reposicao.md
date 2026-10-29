# Regras de presenca, falta e reposicao — Vitale

Status: especificacao em desenvolvimento; nao aplicada ao sistema em producao.

- Plano 1x: 4 aulas; plano 2x: 8 aulas; plano 3x: 12 aulas por pacote.
- Prazo padrao do pacote: 30 dias, com inicio e vencimento editaveis por usuario autorizado.
- Cada aula do pacote tem status: disponivel (cinza), realizada (verde), falta pendente de reposicao (amarelo).
- Semana operacional: segunda a sabado, horario de Fortaleza. Encerramento no fim do sabado; identificar ate domingo as aulas semanais nao realizadas, sem consumir automaticamente direito de reposicao.
- Uma falta amarela permanece elegivel a reposicao ate o vencimento do pacote. Na reposicao, funcionario autorizado seleciona especificamente a falta, informa a data e registra a aula realizada; a bolinha passa a verde e a falta original fica no historico de auditoria.
- Reposicao nao cria aula extra nem aumenta o limite do pacote. A regra de limite semanal deve admitir reposicao autorizada sem bloquear indevidamente a aula regular.
- Nao gerar faltas automaticamente sem definir dias habituais ou alocacao das aulas por semana e sem considerar inicio/vencimento parcial de pacote.
- Registrar autor, data e justificativa das alteracoes; impedir duplicidade de presenca no mesmo dia e registrar eventos faciais separadamente.
- Apos vencimento, manter historico; bloquear reposicao fora do prazo, salvo excecao explicita de administrador a definir.
- Nao aplicar migracoes nem alterar o conector facial antes de testes de seguranca e regressao.

## Fechamento automatico da semana
- Ao virar de sabado para domingo no fuso America/Fortaleza, marcar automaticamente como falta (amarelo) as aulas previstas e nao realizadas de segunda a sabado.
- Operacao idempotente: reexecutar nao pode gerar faltas duplicadas; deve funcionar mesmo se o computador local estiver desligado, usando processamento no servidor ou calculo derivado confiavel.
- Respeitar o inicio e o fim do pacote, sem criar faltas para dias anteriores a ativacao ou posteriores ao vencimento.
- A falta permanece disponivel para reposicao manual ate a data de vencimento do pacote; manter trilha de auditoria ao converter amarelo para verde.
