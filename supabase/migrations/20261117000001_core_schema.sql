-- =============================================================================
-- EDUHACK · Core schema (Fase 1 MVP)
-- Plataforma de aprendizaje por retos profesionales con IA.
--
-- Convenciones
--   * PK uuid (gen_random_uuid), timestamps timestamptz con default now().
--   * Las tablas privadas llevan `user_id` (desnormalizado en tablas hijas) para
--     que las políticas RLS sean triviales: user_id = auth.uid().
--   * Catálogos globales (disciplinas, skills, conceptos, recursos externos) son
--     legibles por usuarios autenticados y solo escribibles con service role.
--   * Estados como CHECK constraints sobre text (más fáciles de migrar que enums).
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Instituciones y taxonomía académica (extensible, sin lista cerrada)
-- -----------------------------------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  country_code char(2),
  website_url text,
  created_at timestamptz not null default now(),
  unique (name)
);

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.disciplines(id) on delete set null,
  description text,
  -- 'curated' = sembrada por el equipo; 'ai_proposed' = propuesta por la IA, pendiente de curaduría
  origin text not null default 'curated' check (origin in ('curated','ai_proposed')),
  created_at timestamptz not null default now()
);
create index disciplines_parent_idx on public.disciplines(parent_id);

create table public.academic_programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete cascade,
  discipline_id uuid references public.disciplines(id) on delete set null,
  name text not null,
  degree_level text not null default 'undergraduate'
    check (degree_level in ('undergraduate','graduate','doctoral','other')),
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null default 'competency'
    check (kind in ('competency','knowledge','tool','language','method')),
  discipline_id uuid references public.disciplines(id) on delete set null,
  description text,
  origin text not null default 'curated' check (origin in ('curated','ai_proposed')),
  created_at timestamptz not null default now()
);
create index skills_name_trgm on public.skills using gin (name gin_trgm_ops);

create table public.skill_prerequisites (
  skill_id uuid not null references public.skills(id) on delete cascade,
  prerequisite_skill_id uuid not null references public.skills(id) on delete cascade,
  strength text not null default 'recommended' check (strength in ('required','recommended')),
  primary key (skill_id, prerequisite_skill_id),
  check (skill_id <> prerequisite_skill_id)
);

-- -----------------------------------------------------------------------------
-- Perfil del estudiante (users = auth.users de Supabase)
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  institution_id uuid references public.institutions(id) on delete set null,
  institution_name text,              -- texto libre si la institución aún no existe
  academic_program_id uuid references public.academic_programs(id) on delete set null,
  program_name text,                  -- texto libre: "Ingeniería en Ciencia de Datos y Matemáticas"
  academic_period text,               -- "5º semestre", "3er año"...
  interests text[] not null default '{}',
  prior_knowledge text,
  tools_known text[] not null default '{}',
  project_experience text check (project_experience in ('none','academic','personal','professional','research')),
  career_goals text,
  weekly_hours smallint check (weekly_hours between 0 and 80),
  preferred_language text not null default 'es',
  hardware_access text,               -- laboratorio, hardware, presupuesto
  learning_preferences jsonb not null default '{}'::jsonb,
  tutor_help_level smallint not null default 2 check (tutor_help_level between 1 and 5),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_profiles_updated before update on public.user_profiles
  for each row execute function public.set_updated_at();

create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
  skill_name text not null,
  -- declared: lo dice el estudiante · demonstrated: respaldado por evaluación · ai_inferred: inferido (no es certificación)
  source text not null check (source in ('declared','demonstrated','ai_inferred')),
  level smallint check (level between 1 and 5),
  evidence_evaluation_id uuid,        -- FK añadida más abajo
  created_at timestamptz not null default now(),
  unique (user_id, skill_name, source)
);
create index user_skills_user_idx on public.user_skills(user_id);

-- -----------------------------------------------------------------------------
-- Objetivos y retos
-- -----------------------------------------------------------------------------
create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null check (char_length(raw_text) between 3 and 2000),
  intent jsonb,                       -- salida validada del Intent Analyzer
  clarification jsonb,                -- preguntas/respuestas de aclaración
  status text not null default 'open' check (status in ('open','clarifying','proposals_ready','accepted','archived','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_goals_user_idx on public.learning_goals(user_id, created_at desc);
create trigger learning_goals_updated before update on public.learning_goals
  for each row execute function public.set_updated_at();

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_goal_id uuid references public.learning_goals(id) on delete set null,
  title text not null,
  -- Transparencia: un reto generado por IA "inspirado en" un problema real NO es un reto publicado por una organización.
  origin text not null default 'ai_generated'
    check (origin in ('ai_generated','industry_inspired','published_by_organization','teacher_proposed')),
  difficulty text not null check (difficulty in ('introductory','intermediate','advanced','research')),
  status text not null default 'proposed' check (status in ('proposed','accepted','discarded')),
  current_version_id uuid,            -- FK añadida más abajo
  discipline_slugs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index challenges_user_idx on public.challenges(user_id, created_at desc);
create trigger challenges_updated before update on public.challenges
  for each row execute function public.set_updated_at();

create table public.challenge_versions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version smallint not null,
  content jsonb not null,             -- ChallengeProposal validado (ver src/domain/challenge.ts)
  change_reason text,
  prompt_version text,
  created_at timestamptz not null default now(),
  unique (challenge_id, version)
);
alter table public.challenges
  add constraint challenges_current_version_fk
  foreign key (current_version_id) references public.challenge_versions(id) on delete set null;

-- Proyecto del estudiante = instancia aceptada de un reto
create table public.student_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  challenge_version_id uuid not null references public.challenge_versions(id) on delete restrict,
  title text not null,
  status text not null default 'planning'
    check (status in ('planning','active','completed','paused','abandoned','failed')),
  progress_pct numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  last_module_id uuid,                -- "continuar donde se quedó"
  plan_prompt_version text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index student_projects_user_idx on public.student_projects(user_id, updated_at desc);
create trigger student_projects_updated before update on public.student_projects
  for each row execute function public.set_updated_at();

create table public.challenge_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.student_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position >= 1),
  title text not null,
  technical_objective text not null,
  description text not null,
  competencies text[] not null default '{}',
  prerequisites text[] not null default '{}',
  activities jsonb not null default '[]'::jsonb,
  tools text[] not null default '{}',
  main_deliverable text not null,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  required_evidence text[] not null default '{}',
  effort_estimate text,
  status text not null default 'pending'
    check (status in ('pending','preparing','in_progress','in_review','completed','needs_changes')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);
create index challenge_modules_project_idx on public.challenge_modules(project_id, position);
create trigger challenge_modules_updated before update on public.challenge_modules
  for each row execute function public.set_updated_at();
alter table public.student_projects
  add constraint student_projects_last_module_fk
  foreign key (last_module_id) references public.challenge_modules(id) on delete set null;

create table public.module_dependencies (
  module_id uuid not null references public.challenge_modules(id) on delete cascade,
  depends_on_module_id uuid not null references public.challenge_modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (module_id, depends_on_module_id),
  check (module_id <> depends_on_module_id)
);

create table public.module_tasks (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.challenge_modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null,
  title text not null,
  details text,
  done boolean not null default false,
  done_at timestamptz,
  unique (module_id, position)
);

-- -----------------------------------------------------------------------------
-- Conocimiento y recursos (just-in-time)
-- -----------------------------------------------------------------------------
create table public.knowledge_concepts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text,
  discipline_slugs text[] not null default '{}',
  embedding vector(768),              -- Fase 2: búsqueda semántica
  created_at timestamptz not null default now()
);
create index knowledge_concepts_name_trgm on public.knowledge_concepts using gin (name gin_trgm_ops);

create table public.module_concepts (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.challenge_modules(id) on delete cascade,
  concept_id uuid not null references public.knowledge_concepts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  why_needed text not null,
  prerequisite_concepts text[] not null default '{}',
  estimated_minutes_min smallint,
  estimated_minutes_max smallint,
  is_fundamental boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','studying','practicing','mastered','skipped_known')),
  knowledge_card jsonb,               -- KnowledgeCard validada (explicación + recursos seleccionados)
  knowledge_card_generated_at timestamptz,
  mastered_at timestamptz,
  unique (module_id, concept_id)
);
create index module_concepts_module_idx on public.module_concepts(module_id);

create table public.resource_providers (
  id text primary key,                -- 'youtube','openalex','github','arxiv','crossref'
  name text not null,
  kind text not null check (kind in ('video','scholarly','code','oer','documentation','forum')),
  base_url text not null,
  terms_url text,
  requires_credentials boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.external_resources (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.resource_providers(id),
  external_id text not null,
  canonical_url text not null check (canonical_url ~ '^https://'),
  title text not null,
  authors text[] not null default '{}',
  organization text,
  published_at date,
  resource_type text not null check (resource_type in ('video','paper','preprint','book','book_chapter','repository','documentation','course','dataset','other')),
  language text,
  license text,
  is_open_access boolean,
  peer_reviewed boolean,              -- null = desconocido
  duration_seconds integer,
  doi text,
  abstract text,                      -- solo metadatos públicos devueltos por la API
  metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null,          -- {provider, endpoint, query, fetched_at}
  last_verified_at timestamptz not null default now(),
  embedding vector(768),
  created_at timestamptz not null default now(),
  unique (provider_id, external_id)
);
create index external_resources_title_trgm on public.external_resources using gin (title gin_trgm_ops);

create table public.resource_segments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.external_resources(id) on delete cascade,
  label text not null,                -- "Sección 3.2", "Capítulo 4"
  start_seconds integer check (start_seconds >= 0),
  end_seconds integer check (end_seconds is null or end_seconds > start_seconds),
  -- Un segmento solo se muestra como "verificado" si su fuente lo respalda (capítulos del autor, TOC oficial, etc.)
  verification text not null check (verification in ('author_chapters','official_toc','transcript','unverified')),
  verification_source text,
  created_at timestamptz not null default now()
);

create table public.concept_resources (
  id uuid primary key default gen_random_uuid(),
  module_concept_id uuid not null references public.module_concepts(id) on delete cascade,
  resource_id uuid not null references public.external_resources(id) on delete cascade,
  segment_id uuid references public.resource_segments(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank smallint not null,
  score numeric(6,4),
  reason text not null,
  confidence text not null check (confidence in ('high','medium','low')),
  saved boolean not null default false,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (module_concept_id, resource_id)
);
create index concept_resources_user_saved_idx on public.concept_resources(user_id) where saved;

create table public.practice_exercises (
  id uuid primary key default gen_random_uuid(),
  module_concept_id uuid not null references public.module_concepts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  expected_output_kind text not null check (expected_output_kind in ('code','numeric','short_text','derivation','explanation')),
  verification_criteria jsonb not null,
  hints jsonb not null default '[]'::jsonb,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.practice_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(answer) <= 20000),
  passed boolean,
  feedback jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Evidencias y evaluación
-- -----------------------------------------------------------------------------
create table public.evaluation_rubrics (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.challenge_modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  criteria jsonb not null,            -- [{id,name,description,weight,levels[]}]
  passing_score numeric(5,2) not null default 70,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.challenge_modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text','repository','url','file','mixed')),
  body text check (char_length(body) <= 50000),
  url text check (url is null or url ~ '^https://'),
  -- received: recibida · analyzed: inspeccionada por la IA · verified: resultado comprobado de forma reproducible · pending_review: requiere revisión humana
  evidence_status text not null default 'received'
    check (evidence_status in ('received','analyzed','verified','pending_review')),
  inspection_notes jsonb not null default '[]'::jsonb, -- qué se pudo / no se pudo inspeccionar realmente
  created_at timestamptz not null default now()
);
create index submissions_module_idx on public.submissions(module_id, created_at desc);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,         -- bucket 'evidence', prefijo {user_id}/
  file_name text not null,
  mime_type text,
  size_bytes integer check (size_bytes <= 20971520),
  inspected boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  rubric_id uuid not null references public.evaluation_rubrics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluator text not null default 'ai' check (evaluator in ('ai','human','automated_tests')),
  criterion_scores jsonb not null,
  overall_score numeric(5,2) not null check (overall_score between 0 and 100),
  outcome text not null check (outcome in ('accepted','needs_changes','insufficient_evidence')),
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  summary text not null,
  prompt_version text,
  model text,
  created_at timestamptz not null default now()
);
alter table public.user_skills
  add constraint user_skills_evidence_fk
  foreign key (evidence_evaluation_id) references public.evaluations(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Portafolio
-- -----------------------------------------------------------------------------
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.student_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  visibility text not null default 'private' check (visibility in ('private','public')),
  content jsonb not null,             -- PortfolioContent (editable por el estudiante)
  generated_content jsonb,            -- versión original generada por IA (trazabilidad)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger portfolio_items_updated before update on public.portfolio_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tutor
-- -----------------------------------------------------------------------------
create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.student_projects(id) on delete cascade,
  module_id uuid references public.challenge_modules(id) on delete cascade,
  module_concept_id uuid references public.module_concepts(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tutor_conversations_ctx_idx on public.tutor_conversations(user_id, project_id, module_id);

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 40000),
  help_level smallint check (help_level between 1 and 5),
  created_at timestamptz not null default now()
);
create index tutor_messages_conv_idx on public.tutor_messages(conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Progreso, uso de IA y caché
-- -----------------------------------------------------------------------------
create table public.learning_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.student_projects(id) on delete cascade,
  module_id uuid references public.challenge_modules(id) on delete cascade,
  module_concept_id uuid references public.module_concepts(id) on delete set null,
  event_type text not null check (event_type in (
    'project_started','module_started','module_status_changed','concept_studied','concept_marked_known',
    'practice_attempted','practice_passed','resource_opened','submission_created','evaluation_received',
    'module_completed','project_completed','route_adjusted','portfolio_generated')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index learning_progress_user_idx on public.learning_progress(user_id, created_at desc);

create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null,            -- 'challenge_designer', 'tutor', ...
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  estimated_cost_usd numeric(10,6),   -- null si no hay tabla de precios configurada para el modelo
  latency_ms integer,
  status text not null check (status in ('ok','error','validation_error','rate_limited','refused')),
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_logs_user_time_idx on public.ai_usage_logs(user_id, created_at desc);

-- Caché de proveedores externos (solo service role)
create table public.provider_cache (
  cache_key text primary key,
  provider_id text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index provider_cache_expiry_idx on public.provider_cache(expires_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.institutions        enable row level security;
alter table public.disciplines         enable row level security;
alter table public.academic_programs   enable row level security;
alter table public.skills              enable row level security;
alter table public.skill_prerequisites enable row level security;
alter table public.knowledge_concepts  enable row level security;
alter table public.resource_providers  enable row level security;
alter table public.external_resources  enable row level security;
alter table public.resource_segments   enable row level security;
alter table public.provider_cache      enable row level security; -- sin políticas: solo service role

-- Catálogos: lectura para autenticados
do $$
declare t text;
begin
  foreach t in array array['institutions','disciplines','academic_programs','skills','skill_prerequisites',
                           'knowledge_concepts','resource_providers','external_resources','resource_segments']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Tablas privadas por usuario: CRUD solo sobre filas propias
do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_skills','learning_goals','challenges','challenge_versions',
                           'student_projects','challenge_modules','module_dependencies','module_tasks',
                           'module_concepts','concept_resources','practice_exercises','practice_attempts',
                           'submissions','submission_files','evaluation_rubrics','evaluations','portfolio_items',
                           'tutor_conversations','tutor_messages','learning_progress']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_own_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_own_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_own_delete', t);
  end loop;
end $$;

-- Las evaluaciones y el uso de IA no deben ser falsificables por el cliente:
-- se escriben desde el servidor con service role. Quitamos insert/update/delete del estudiante.
drop policy evaluations_own_insert on public.evaluations;
drop policy evaluations_own_update on public.evaluations;
drop policy evaluations_own_delete on public.evaluations;

alter table public.ai_usage_logs enable row level security;
create policy ai_usage_logs_own_select on public.ai_usage_logs
  for select to authenticated using (user_id = (select auth.uid()));

-- Portafolio público: lectura anónima solo de elementos marcados como públicos
create policy portfolio_items_public_read on public.portfolio_items
  for select to anon, authenticated using (visibility = 'public');

-- =============================================================================
-- Auth hook: crear perfil vacío al registrarse
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Storage: bucket privado de evidencias, carpeta por usuario
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 20971520)
on conflict (id) do nothing;

create policy evidence_own_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy evidence_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy evidence_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
