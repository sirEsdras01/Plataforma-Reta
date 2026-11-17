-- Prueba de comportamiento RLS e integridad (se ejecuta tras las migraciones en el stub local).
\set ON_ERROR_STOP on
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name":"Beto"}');

-- El trigger creó los perfiles
select count(*) = 2 as profiles_created from public.user_profiles;

-- Datos de Ana (como service role / superusuario)
insert into public.challenges (id, user_id, title, difficulty) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Reto Ana', 'intermediate');
insert into public.challenge_versions (id, challenge_id, user_id, version, content) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, '{}');
insert into public.student_projects (id, user_id, challenge_id, challenge_version_id, title, status) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Proyecto Ana', 'active');
insert into public.challenge_modules (id, project_id, user_id, position, title, technical_objective, description, main_deliverable) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, 'M1', 'o', 'd', 'e');
insert into public.portfolio_items (project_id, user_id, slug, content) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'proyecto-ana', '{}');

-- Como Beto (authenticated): no ve nada de Ana
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select count(*) = 0 as beto_cannot_see_projects from public.student_projects;
select count(*) = 0 as beto_cannot_see_modules from public.challenge_modules;
select count(*) = 0 as beto_cannot_see_private_portfolio from public.portfolio_items;
update public.student_projects set title = 'hacked';  -- 0 filas afectadas
do $$ begin
  begin
    insert into public.challenges (user_id, title, difficulty) values ('00000000-0000-0000-0000-00000000000a', 'spoof', 'introductory');
    raise exception 'FAIL: Beto inserted a row for Ana';
  exception when insufficient_privilege then null; end;
end $$;
select 'beto_cannot_insert_for_others' as ok;

-- Como Ana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select count(*) = 1 as ana_sees_own_project from public.student_projects;
-- Ana no puede autocompletar un módulo sin evaluación aceptada
do $$ begin
  begin
    update public.challenge_modules set status = 'completed' where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: module completed without evaluation';
  exception when check_violation then null; end;
end $$;
select 'ana_cannot_complete_without_evaluation' as ok;
-- Ana no puede insertar evaluaciones ni intentos aprobados
do $$ begin
  begin
    insert into public.submissions (module_id, user_id, kind, body) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'text', 'x');
    raise exception 'FAIL: client inserted a submission';
  exception when insufficient_privilege then null; end;
end $$;
select 'ana_cannot_write_submissions_directly' as ok;
-- El proyecto no puede completarse con módulos abiertos
do $$ begin
  begin
    update public.student_projects set status = 'completed' where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: project completed with open modules';
  exception when check_violation then null; end;
end $$;
select 'project_requires_all_modules' as ok;

-- Portafolio público visible para anónimos solo al publicarlo
update public.portfolio_items set visibility = 'public' where slug = 'proyecto-ana';
reset role;
set role anon;
select count(*) = 1 as anon_sees_public_portfolio from public.portfolio_items where slug = 'proyecto-ana';
select count(*) = 0 as anon_cannot_see_projects from public.student_projects;
reset role;

-- Flujo del servidor (service role): evidencia + evaluación aceptada => el módulo puede completarse
insert into public.evaluation_rubrics (id, module_id, user_id, criteria) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '[]');
insert into public.submissions (id, module_id, user_id, kind, body, evidence_status) values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'text', 'x', 'analyzed');
insert into public.evaluations (submission_id, rubric_id, user_id, criterion_scores, overall_score, outcome, summary) values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '[]', 85, 'accepted', 'ok');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.challenge_modules set status = 'completed' where id = '40000000-0000-0000-0000-000000000001';
update public.student_projects set status = 'completed' where id = '30000000-0000-0000-0000-000000000001';
select status = 'completed' and completed_at is not null as project_completed from public.student_projects;
reset role;

-- Supresión: borrar al usuario elimina en cascada todos sus datos
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select (select count(*) from public.student_projects) = 0
   and (select count(*) from public.evaluations) = 0
   and (select count(*) from public.portfolio_items) = 0 as cascade_delete_ok;
