# E-mails transacionais da Vitale

Projeto Supabase: orymbkdypdhzocctfsrf.

Em Authentication > Email Templates:

- Invite user: assunto `Seu convite para a equipe Vitale`; conteúdo `invite.html`.
- Reset password: assunto `Seu acesso à Vitale`; conteúdo `recovery.html`.

Preservar a variável Go Template `{{ .ConfirmationURL }}`: ela contém a verificação de autenticação e o redirecionamento com o identificador do convite.

O reenvio para uma conta já existente usa o modelo de recuperação. Esse modelo serve também à recuperação comum de senha; por isso, o prazo de 5 minutos é apresentado como condição para convites da equipe. O servidor verifica esse prazo antes de habilitar o acesso.

Status: modelos preparados; aplicar no painel antes de declarar os e-mails personalizados ativos.
