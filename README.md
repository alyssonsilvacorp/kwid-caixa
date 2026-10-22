# RodaCaixa (Kwid Caixa)

Aplicativo financeiro **mobile-first** para motoristas de aplicativo, com visual escuro e dados salvos no Supabase.

## Funcionalidades (MVP)
- Cadastro/login por e-mail com Supabase Auth; recuperação de senha.
- Registro de turnos com **odômetro inicial e final**, quilômetros totais e separação por 99, Uber, inDrive, particular ou outros.
- Custos de combustível estimados, pacotes e despesas, provisão de desgaste e resumo de resultado líquido operacional.
- Metas financeiras personalizadas (pneus, peças, documentação, upgrades) com data-limite, prioridade e ritmo diário estimado.
- Exportação CSV, backup e importação JSON com confirmação.
- Dados financeiros no Supabase `public.driver_ledgers`, protegidos por RLS (por usuário); sincronização com controle de revisão.

## Arquitetura
Frontend estático (HTML/CSS/JavaScript) sem etapa de build, publicado na Vercel. Biblioteca `@supabase/supabase-js@2.57.0` carregada por CDN. A configuração do projeto Supabase contém exclusivamente **chave pública publishable** no frontend; nunca coloque service-role/secret keys no repositório.

- Supabase: `mdqdttqulwncbrnpbddh` (Grupo Izaly)
- Projeto Vercel original: `kwid-caixa-web`
- Repositório: `alyssonsilvacorp/kwid-caixa`

## Uso e publicação

Não há instalação de dependências nem comando de compilação. Faça deploy de `main` como aplicativo estático na Vercel, com `Framework Preset = Other`, diretório raiz do repositório e **sem Build Command**.

Para links de confirmação de e-mail e recuperação de senha, configure no Supabase **Authentication > URL Configuration**:
- Site URL = endereço público definitivo da aplicação;
- Redirect URLs = endereço público definitivo da aplicação (e, se necessário, os previews autorizados).

O app exige uma conta de usuário real criada pelo próprio usuário. Sem autenticação, os dados financeiros não são acessíveis. Não é necessário configurar senhas no banco manualmente.

## Validação pendente e limitações

Este repositório contém um **MVP em teste**. Ainda é necessário verificar cadastro real, confirmação de e-mail, recuperação de senha, persistência, sincronização e conflitos em dois dispositivos, além de testar toda a experiência no Safari/iPhone. Os valores de reserva e desgaste são projeções e não saldos bancários. A integração com API/histórico da 99 ainda não existe. Sem internet o app bloqueia gravações.

## Segurança

Tabelas expostas com RLS e políticas `auth.uid() = user_id`. Nunca compartilhe credenciais pessoais na conversa, issues, logs ou commits. Chave publishable é pública por definição e deve ser usada somente com políticas RLS verificadas.
