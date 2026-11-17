-- =============================================================================
-- Integridad de progreso + datos semilla mínimos
-- =============================================================================

-- Un módulo solo puede marcarse como completado si existe una evaluación aceptada
-- para una evidencia de ese módulo. Evita que el cliente "se complete" módulos
-- directamente vía PostgREST.
create or replace function public.guard_module_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    if not exists (
      select 1
      from public.evaluations e
      join public.submissions s on s.id = e.submission_id
      where s.module_id = new.id and e.outcome = 'accepted'
    ) then
      raise exception 'module % cannot be completed without an accepted evaluation', new.id
        using errcode = 'check_violation';
    end if;
    new.completed_at = coalesce(new.completed_at, now());
  end if;
  return new;
end $$;

create trigger challenge_modules_guard_completion
  before update of status on public.challenge_modules
  for each row execute function public.guard_module_completion();

-- Un proyecto solo puede completarse si todos sus módulos están completados.
create or replace function public.guard_project_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    if exists (
      select 1 from public.challenge_modules m
      where m.project_id = new.id and m.status <> 'completed'
    ) then
      raise exception 'project % has unfinished modules', new.id using errcode = 'check_violation';
    end if;
    new.completed_at = coalesce(new.completed_at, now());
  end if;
  return new;
end $$;

create trigger student_projects_guard_completion
  before update of status on public.student_projects
  for each row execute function public.guard_project_completion();

-- Un concepto solo pasa a 'mastered' si hay un intento de práctica aprobado
-- (la opción "Ya lo sé" usa el estado distinto 'skipped_known').
create or replace function public.guard_concept_mastery()
returns trigger language plpgsql as $$
begin
  if new.status = 'mastered' and (old.status is distinct from 'mastered') then
    if not exists (
      select 1 from public.practice_attempts a
      join public.practice_exercises x on x.id = a.exercise_id
      where x.module_concept_id = new.id and a.passed is true
    ) then
      raise exception 'concept % requires a passed practice attempt', new.id using errcode = 'check_violation';
    end if;
    new.mastered_at = coalesce(new.mastered_at, now());
  end if;
  return new;
end $$;

create trigger module_concepts_guard_mastery
  before update of status on public.module_concepts
  for each row execute function public.guard_concept_mastery();

-- Tablas cuyo contenido determina el progreso (intentos de práctica, evidencias)
-- solo se escriben desde el servidor con service role, después de comprobar la
-- propiedad con el cliente del usuario. El estudiante conserva lectura y borrado.
drop policy practice_attempts_own_insert on public.practice_attempts;
drop policy practice_attempts_own_update on public.practice_attempts;
drop policy submissions_own_insert on public.submissions;
drop policy submissions_own_update on public.submissions;
drop policy submission_files_own_update on public.submission_files;

-- -----------------------------------------------------------------------------
-- Eliminación de datos del estudiante (derecho de supresión)
-- Borra al usuario de auth.users; todo lo privado cae por ON DELETE CASCADE.
-- Se invoca desde el servidor con service role (ver src/app/(app)/settings/actions.ts).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Semillas: proveedores de recursos del MVP
-- -----------------------------------------------------------------------------
insert into public.resource_providers (id, name, kind, base_url, terms_url, requires_credentials) values
  ('youtube',  'YouTube Data API v3', 'video',     'https://www.googleapis.com/youtube/v3', 'https://developers.google.com/youtube/terms/api-services-terms-of-service', true),
  ('openalex', 'OpenAlex',            'scholarly', 'https://api.openalex.org',              'https://openalex.org/about', false),
  ('crossref', 'Crossref REST API',   'scholarly', 'https://api.crossref.org',              'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', false),
  ('arxiv',    'arXiv API',           'scholarly', 'https://export.arxiv.org/api',          'https://info.arxiv.org/help/api/tou.html', false),
  ('github',   'GitHub REST API',     'code',      'https://api.github.com',                'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service', false)
on conflict (id) do nothing;

-- Semillas de taxonomía: punto de partida, NO lista cerrada. La IA puede proponer
-- nuevas disciplinas (origin = 'ai_proposed').
insert into public.disciplines (slug, name) values
  ('engineering', 'Ingeniería')
on conflict (slug) do nothing;

insert into public.disciplines (slug, name, parent_id)
select v.slug, v.name, (select id from public.disciplines where slug = 'engineering')
from (values
  ('data-science-math',  'Ciencia de Datos y Matemáticas'),
  ('artificial-intelligence', 'Inteligencia Artificial'),
  ('software',           'Ingeniería de Software'),
  ('computer-technologies', 'Tecnologías Computacionales'),
  ('mechatronics',       'Mecatrónica'),
  ('mechanical',         'Mecánica'),
  ('electrical',         'Eléctrica'),
  ('electronics',        'Electrónica'),
  ('biomedical',         'Biomédica'),
  ('chemical',           'Química'),
  ('industrial',         'Industrial'),
  ('civil',              'Civil'),
  ('aerospace',          'Aeroespacial'),
  ('environmental',      'Ambiental'),
  ('energy',             'Energía'),
  ('materials',          'Materiales'),
  ('telecommunications', 'Telecomunicaciones'),
  ('automotive',         'Automotriz'),
  ('robotics',           'Robótica'),
  ('systems',            'Sistemas'),
  ('nuclear',            'Nuclear'),
  ('biotechnology',      'Biotecnología')
) as v(slug, name)
on conflict (slug) do nothing;

insert into public.institutions (name, short_name, country_code, website_url)
values ('Tecnológico de Monterrey', 'Tec', 'MX', 'https://tec.mx')
on conflict (name) do nothing;
