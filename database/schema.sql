create table if not exists public.design_requirements (
  source_id text primary key,
  name text not null,
  project text not null default '未归属项目',
  source_url text,
  requester text,
  product_owner text,
  owner text,
  priority text not null default 'P2',
  status text not null default '待设计',
  estimate_hours integer not null default 8,
  sequence integer not null default 999,
  is_rush boolean not null default false,
  rush_reason text,
  start_date date,
  due_date date,
  original_start_date date,
  original_end_date date,
  auto_scheduled_date date,
  synced_at timestamptz,
  blocked_reason text,
  note text,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_requirements_owner_idx
  on public.design_requirements(owner);

create index if not exists design_requirements_project_idx
  on public.design_requirements(project);

create index if not exists design_requirements_status_idx
  on public.design_requirements(status);

create index if not exists design_requirements_sequence_idx
  on public.design_requirements(sequence);
