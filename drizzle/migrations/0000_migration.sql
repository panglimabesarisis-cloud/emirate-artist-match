
-- ROLES
create type public.app_role as enum ('admin','artist','client');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

-- signup: role only artist or client (never admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text;
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  r := coalesce(new.raw_user_meta_data->>'account_type','client');
  if r not in ('artist','client') then r := 'client'; end if;
  insert into public.user_roles(user_id, role) values (new.id, r::app_role) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- CATALOG
create table public.emirates (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, name_ar text, sort int default 0);
create table public.areas (id uuid primary key default gen_random_uuid(), emirate_id uuid not null references public.emirates(id) on delete cascade, slug text not null, name text not null, unique(emirate_id, slug));
create table public.categories (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, name_ar text, icon text, description text, sort int default 0);
create table public.subcategories (id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories(id) on delete cascade, slug text not null, name text not null, unique(category_id, slug));
create table public.event_types (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, sort int default 0);

do $$ declare t text; begin
  foreach t in array array['emirates','areas','categories','subcategories','event_types'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;

-- ARTISTS
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  slug text unique not null,
  stage_name text not null,
  tagline text,
  bio text,
  category_id uuid references public.categories(id),
  subcategory_id uuid references public.subcategories(id),
  emirate_id uuid references public.emirates(id),
  area_id uuid references public.areas(id),
  travel_radius_km int default 30,
  base_price numeric(10,2) default 0,
  languages text[] default array['English'],
  event_type_slugs text[] default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  plan text not null default 'free' check (plan in ('free','medium','pro')),
  featured boolean not null default false,
  response_rate int default 90,
  hue int default 30,
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.artists to anon;
grant select, insert, update, delete on public.artists to authenticated;
grant all on public.artists to service_role;
alter table public.artists enable row level security;
create policy "approved public" on public.artists for select to anon, authenticated using (status = 'approved');
create policy "owner read" on public.artists for select to authenticated using (user_id = auth.uid());
create policy "admin read" on public.artists for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "owner insert" on public.artists for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and featured = false and public.has_role(auth.uid(),'artist'));
create policy "owner update" on public.artists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin update" on public.artists for update to authenticated using (public.has_role(auth.uid(),'admin'));

-- prevent owners from changing status/featured/plan
create or replace function public.guard_artist_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') and auth.uid() is not null then
    new.status := old.status; new.featured := old.featured; new.plan := old.plan; new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger artists_guard before update on public.artists for each row execute function public.guard_artist_fields();

create table public.artist_badges (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  badge text not null check (badge in ('verified_identity','verified_business','verified_performer','top_performer')),
  granted_at timestamptz not null default now(),
  unique(artist_id, badge)
);
create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null, description text, price numeric(10,2) not null, duration_minutes int default 60, sort int default 0
);
create table public.stat_visibility (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  show_orders boolean not null default true,
  revenue_mode text not null default 'range' check (revenue_mode in ('hidden','range','exact')),
  show_rating boolean not null default true,
  show_response boolean not null default true,
  show_repeat boolean not null default true,
  show_member_since boolean not null default true
);
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  date date not null, note text, unique(artist_id, date)
);

do $$ declare t text; begin
  foreach t in array array['artist_badges','rate_cards','stat_visibility','availability'] loop
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (exists (select 1 from public.artists a where a.id = artist_id and (a.status=''approved'' or a.user_id = auth.uid() or public.has_role(auth.uid(),''admin''))))', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
  end loop;
  foreach t in array array['rate_cards','stat_visibility','availability'] loop
    execute format('create policy "owner write" on public.%I for all to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid())) with check (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()))', t);
  end loop;
end $$;
-- stat_visibility isn't needed publicly (stats function masks), but read is harmless.

-- BOOKINGS (private)
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  client_user_id uuid,
  client_name text not null,
  event_type_id uuid references public.event_types(id),
  event_date date not null,
  amount numeric(10,2) not null,
  status text not null default 'confirmed' check (status in ('inquiry','quoted','confirmed','completed','cancelled','disputed')),
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
create policy "owner/client/admin read" on public.bookings for select to authenticated using (
  client_user_id = auth.uid() or public.has_role(auth.uid(),'admin')
  or exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "admin write" on public.bookings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  client_name text not null,
  event_label text,
  rating int not null check (rating between 1 and 5),
  body text,
  reply text,
  status text not null default 'published' check (status in ('published','hidden','reported')),
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.reviews to anon;
grant select, insert, update on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "published public" on public.reviews for select to anon, authenticated using (status = 'published' and exists (select 1 from public.artists a where a.id = artist_id and a.status='approved'));
create policy "owner read" on public.reviews for select to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "owner reply" on public.reviews for update to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "admin all" on public.reviews for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create or replace function public.guard_review_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') and auth.uid() is not null then
    new.rating := old.rating; new.body := old.body; new.status := case when new.status='reported' then 'reported' else old.status end;
    new.client_name := old.client_name; new.artist_id := old.artist_id;
  end if;
  return new;
end $$;
create trigger reviews_guard before update on public.reviews for each row execute function public.guard_review_fields();

-- QUOTES
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  client_user_id uuid,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 255),
  phone text check (phone is null or length(phone) <= 30),
  event_type_id uuid references public.event_types(id),
  event_date date,
  area_id uuid references public.areas(id),
  guests int,
  budget numeric(10,2),
  message text check (message is null or length(message) <= 2000),
  status text not null default 'new' check (status in ('new','replied','closed')),
  created_at timestamptz not null default now()
);
grant insert on public.quote_requests to anon;
grant select, insert, update on public.quote_requests to authenticated;
grant all on public.quote_requests to service_role;
alter table public.quote_requests enable row level security;
create policy "anyone submit" on public.quote_requests for insert to anon, authenticated with check (status = 'new' and exists (select 1 from public.artists a where a.id = artist_id and a.status='approved'));
create policy "artist read" on public.quote_requests for select to authenticated using (client_user_id = auth.uid() or public.has_role(auth.uid(),'admin') or exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "artist update" on public.quote_requests for update to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()) or public.has_role(auth.uid(),'admin'));

-- VERIFICATION
create table public.verification_applications (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  badge_type text not null check (badge_type in ('verified_identity','verified_business','verified_performer')),
  doc_path text,
  note text,
  status text not null default 'submitted' check (status in ('submitted','under_review','needs_more_info','approved','rejected')),
  admin_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.verification_applications to authenticated;
grant all on public.verification_applications to service_role;
alter table public.verification_applications enable row level security;
create policy "owner read" on public.verification_applications for select to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()) or public.has_role(auth.uid(),'admin'));
create policy "owner insert" on public.verification_applications for insert to authenticated with check (status='submitted' and exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "admin update" on public.verification_applications for update to authenticated using (public.has_role(auth.uid(),'admin'));

-- approve -> badge
create or replace function public.on_verification_decided() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.artist_badges(artist_id, badge) values (new.artist_id, new.badge_type) on conflict do nothing;
    new.decided_at := now();
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    new.decided_at := now();
  end if;
  return new;
end $$;
create trigger verification_decided before update on public.verification_applications for each row execute function public.on_verification_decided();

-- PUBLIC STATS (computed, masked by visibility)
create or replace function public.artist_public_stats()
returns table (artist_id uuid, completed_orders int, rating numeric, review_count int, revenue_label text, response_rate int, repeat_clients int, member_since date)
language sql stable security definer set search_path = public as $$
  with b as (
    select artist_id, count(*) filter (where status='completed') as done,
           coalesce(sum(amount) filter (where status='completed'),0) as rev
    from bookings group by artist_id),
  rc as (
    select artist_id, count(*)::int as repeat from (
      select artist_id, client_name from bookings where status='completed' group by 1,2 having count(*)>1) x group by 1),
  r as (select artist_id, round(avg(rating)::numeric,1) as avg, count(*)::int as n from reviews where status='published' group by 1)
  select a.id,
    case when coalesce(v.show_orders,true) then coalesce(b.done,0)::int end,
    case when coalesce(v.show_rating,true) then r.avg end,
    coalesce(r.n,0),
    case coalesce(v.revenue_mode,'range')
      when 'hidden' then null
      when 'exact' then 'AED ' || to_char(coalesce(b.rev,0),'FM999,999,990')
      else case when coalesce(b.rev,0) < 10000 then 'Under AED 10K'
                when b.rev < 50000 then 'AED 10K–50K'
                when b.rev < 100000 then 'AED 50K–100K'
                when b.rev < 250000 then 'AED 100K–250K'
                else 'AED 250K+' end end,
    case when coalesce(v.show_response,true) then a.response_rate end,
    case when coalesce(v.show_repeat,true) then coalesce(rc.repeat,0) end,
    case when coalesce(v.show_member_since,true) then a.created_at::date end
  from artists a
  left join b on b.artist_id=a.id
  left join rc on rc.artist_id=a.id
  left join r on r.artist_id=a.id
  left join stat_visibility v on v.artist_id=a.id
  where a.status='approved';
$$;
grant execute on function public.artist_public_stats() to anon, authenticated;

-- SEED: locations
insert into public.emirates(slug,name,name_ar,sort) values
('dubai','Dubai','دبي',1),('abu-dhabi','Abu Dhabi','أبو ظبي',2),('sharjah','Sharjah','الشارقة',3),('ajman','Ajman','عجمان',4),
('ras-al-khaimah','Ras Al Khaimah','رأس الخيمة',5),('fujairah','Fujairah','الفجيرة',6),('umm-al-quwain','Umm Al Quwain','أم القيوين',7);

insert into public.areas(emirate_id, slug, name)
select e.id, lower(regexp_replace(n,'[^a-zA-Z0-9]+','-','g')), n from public.emirates e,
unnest(array['Downtown Dubai','Business Bay','DIFC','Dubai Marina','JBR','JLT','Palm Jumeirah','Jumeirah','Umm Suqeim','Al Barsha','Al Quoz','Dubai Hills Estate','Arabian Ranches','Dubai Media City','Dubai Internet City','Deira','Bur Dubai','Al Karama','Dubai Creek Harbour','Dubai South','Expo City Dubai','Mirdif','Al Furjan','Jumeirah Village Circle','Meydan','Festival City','Silicon Oasis','Motor City','Sports City','Bluewaters Island']) n
where e.slug='dubai';
insert into public.areas(emirate_id, slug, name)
select e.id, lower(regexp_replace(n,'[^a-zA-Z0-9]+','-','g')), n from public.emirates e,
unnest(array['Saadiyat Island','Yas Island','Corniche','Al Reem Island']) n where e.slug='abu-dhabi';
insert into public.areas(emirate_id, slug, name)
select e.id, lower(regexp_replace(n,'[^a-zA-Z0-9]+','-','g')), n from public.emirates e,
unnest(array['Al Majaz','Al Khan','Aljada']) n where e.slug='sharjah';

insert into public.event_types(slug,name,sort)
select lower(regexp_replace(n,'[^a-zA-Z0-9]+','-','g')), n, ord from unnest(array['Wedding','Engagement / Henna Night','Corporate Event','Gala Dinner','Product Launch','Brand Activation','Mall Activation','Conference','Exhibition','Birthday Party','Kids Party','Yacht Party','Private Villa Party','Hotel / Restaurant Residency','Beach Club Event','Ramadan / Iftar / Suhoor','Eid Celebration','UAE National Day','New Year''s Eve','School / University Event','Charity Event','Content Shoot / Campaign']) with ordinality as t(n, ord);

insert into public.categories(slug,name,name_ar,icon,description,sort) values
('musicians','Musicians','موسيقيون','music','Singers, bands, oud players and string quartets for every stage.',1),
('djs','DJs','دي جي','disc','Wedding, club, corporate and Arabic DJs who read the room.',2),
('arabic-cultural-acts','Arabic & Cultural Acts','فنون عربية','sparkles','Tanoura, zaffa, yowla and henna — heritage that moves people.',3),
('dancers','Dancers','راقصون','footprints','Crews, ballet, hip-hop, Bollywood and Latin performers.',4),
('variety-entertainers','Variety Entertainers','فنون متنوعة','flame','Magicians, fire, LED and aerial shows that stop the room.',5),
('comedians-emcees','Comedians & Emcees','مقدمو حفلات','mic','Bilingual MCs, stand-up comics and game-show hosts.',6),
('influencers-creators','Influencers & Creators','مؤثرون','camera','Instagram, TikTok and UGC creators for launches and campaigns.',7),
('hosts-models','Hosts & Models','مضيفون','user','Brand ambassadors, hostesses and promo models.',8),
('speakers','Speakers','متحدثون','presentation','Keynotes, industry experts and workshop facilitators.',9),
('photo-video','Photo & Video','تصوير','aperture','Event photographers, videographers, drones and 360 booths.',10),
('kids-entertainment','Kids Entertainment','ترفيه الأطفال','balloon','Face painters, balloon artists and kids magicians.',11);

insert into public.subcategories(category_id, slug, name)
select c.id, lower(regexp_replace(s,'[^a-zA-Z0-9]+','-','g')), s from public.categories c
join (values
 ('musicians', array['Singer','Wedding Singer','Band','Oud Player','Saxophonist','Violinist','Pianist','Harpist','String Quartet']),
 ('djs', array['Wedding DJ','Club DJ','Corporate DJ','Arabic DJ','DJ + Sax']),
 ('arabic-cultural-acts', array['Tanoura Dancer','Arabic Band','Zaffa Troupe','Yowla Troupe','Henna Artist','Khaleeji Dancers']),
 ('dancers', array['Dance Crew','Ballet','Hip-hop','Bollywood','Latin']),
 ('variety-entertainers', array['Magician','Fire Show','LED Show','Aerialist','Stilt Walker','Caricaturist']),
 ('comedians-emcees', array['Bilingual Emcee','Stand-up Comedian','Game Show Host']),
 ('influencers-creators', array['Instagram Creator','TikTok Creator','UGC Creator']),
 ('hosts-models', array['Brand Ambassador','Event Hostess','Promo Model']),
 ('speakers', array['Motivational Speaker','Industry Expert','Workshop Facilitator']),
 ('photo-video', array['Event Photographer','Videographer','Drone Operator','360 Booth']),
 ('kids-entertainment', array['Face Painter','Balloon Artist','Kids Magician'])
) v(cat, subs) on v.cat = c.slug, unnest(v.subs) s;

-- SEED: artists
insert into public.artists(slug, stage_name, tagline, bio, category_id, subcategory_id, emirate_id, area_id, base_price, languages, event_type_slugs, status, plan, featured, response_rate, hue, is_seed, created_at)
select x.slug, x.name, x.tagline, x.bio, c.id, s.id, e.id, ar.id, x.price, x.langs, x.evs, 'approved', x.plan, x.featured, x.resp, x.hue, true, now() - (x.months || ' months')::interval
from (values
 ('layla-noor','Layla Noor','Soulful wedding vocalist in English & Arabic','Layla blends classic Arabic ballads with modern pop for weddings and galas across Dubai.','musicians','wedding-singer','dubai','palm-jumeirah',4500,array['English','Arabic'],array['wedding','gala-dinner','engagement-henna-night'],'pro',true,98,20,30),
 ('marina-strings','Marina Strings Quartet','Elegant string quartet for ceremonies','Four classically trained players covering Vivaldi to Coldplay.','musicians','string-quartet','dubai','dubai-marina',7800,array['English'],array['wedding','corporate-event','gala-dinner'],'pro',true,95,200,26),
 ('karim-oud','Karim Al Oud','Traditional oud for majlis & iftar','Karim performs classical maqam and Khaleeji repertoire on oud.','musicians','oud-player','dubai','jumeirah',2200,array['Arabic','English'],array['ramadan-iftar-suhoor','eid-celebration','private-villa-party'],'medium',false,92,35,18),
 ('sax-after-dark','Sax After Dark','Deep house saxophone for beach clubs','Live sax over DJ sets — sunset sessions are his speciality.','musicians','saxophonist','dubai','jbr',1800,array['English','Russian'],array['beach-club-event','yacht-party','brand-activation'],'medium',false,88,280,14),
 ('the-creek-band','The Creek Band','5-piece covers band, 70s to today','High-energy live band for corporate parties and NYE.','musicians','band','dubai','dubai-creek-harbour',12000,array['English'],array['corporate-event','new-year-s-eve','gala-dinner'],'pro',false,90,150,22),
 ('dj-falcon','DJ Falcon','Arabic & commercial house DJ','From Khaleeji hits to afro-house, Falcon keeps floors full.','djs','arabic-dj','dubai','business-bay',3000,array['Arabic','English'],array['wedding','private-villa-party','uae-national-day'],'pro',true,97,10,34),
 ('dj-sienna','DJ Sienna','Wedding DJ who reads every room','Bespoke playlists, MC support and full sound & light packages.','djs','wedding-dj','dubai','dubai-hills-estate',3500,array['English','French'],array['wedding','birthday-party','engagement-henna-night'],'medium',false,94,330,20),
 ('dj-nomad','DJ Nomad','Corporate & product launch DJ','Polished sets for launches, conferences and brand nights.','djs','corporate-dj','dubai','difc',2500,array['English','Hindi'],array['product-launch','corporate-event','conference'],'free',false,82,240,6),
 ('sufi-spin','Sufi Spin Tanoura','Mesmerising LED tanoura performance','Award-winning tanoura dancer with LED skirt finale.','arabic-cultural-acts','tanoura-dancer','dubai','downtown-dubai',1600,array['Arabic','English'],array['wedding','corporate-event','ramadan-iftar-suhoor'],'medium',true,93,45,24),
 ('al-fakhr-zaffa','Al Fakhr Zaffa Troupe','Grand zaffa entrances for weddings','12-member troupe with drums and traditional costumes.','arabic-cultural-acts','zaffa-troupe','sharjah','al-majaz',5500,array['Arabic'],array['wedding','engagement-henna-night'],'pro',false,89,25,28),
 ('henna-by-maryam','Henna by Maryam','Bridal & party henna artistry','Intricate Khaleeji and Indian henna for brides and guests.','arabic-cultural-acts','henna-artist','dubai','mirdif',900,array['Arabic','English','Urdu'],array['engagement-henna-night','eid-celebration','birthday-party'],'free',false,85,15,9),
 ('pulse-crew','Pulse Dance Crew','Hip-hop crew for brand activations','Choreographed shows and flash mobs for malls and launches.','dancers','dance-crew','dubai','al-quoz',4200,array['English'],array['mall-activation','brand-activation','product-launch'],'medium',false,87,300,16),
 ('rang-bollywood','Rang Bollywood','Bollywood dancers for sangeet & galas','Colourful Bollywood numbers with audience participation.','dancers','bollywood','dubai','al-karama',2800,array['English','Hindi'],array['wedding','corporate-event','birthday-party'],'free',false,80,350,8),
 ('the-great-zayan','The Great Zayan','Close-up & stage magician','Mind-reading and sleight of hand in English and Arabic.','variety-entertainers','magician','dubai','al-barsha',2000,array['English','Arabic'],array['corporate-event','birthday-party','private-villa-party'],'pro',true,99,260,36),
 ('ember-fire','Ember Fire Show','Fire & pyro performers for beach events','Fire breathing, poi and pyro finales — fully insured.','variety-entertainers','fire-show','dubai','bluewaters-island',3200,array['English'],array['beach-club-event','yacht-party','new-year-s-eve'],'medium',false,86,5,12),
 ('neon-aerial','Neon Aerial','LED aerial silks & hoop','Breathtaking aerial acts for galas and launches.','variety-entertainers','aerialist','abu-dhabi','yas-island',5000,array['English','Spanish'],array['gala-dinner','product-launch','exhibition'],'free',false,78,190,5),
 ('omar-mc','Omar The MC','Bilingual EN/AR emcee & host','Corporate host for conferences, awards and weddings.','comedians-emcees','bilingual-emcee','dubai','dubai-media-city',3800,array['English','Arabic'],array['conference','gala-dinner','wedding'],'pro',false,96,215,30),
 ('funny-fatima','Funny Fatima','Clean stand-up for corporate crowds','Relatable, family-friendly comedy about life in the UAE.','comedians-emcees','stand-up-comedian','dubai','jlt',2500,array['English','Arabic'],array['corporate-event','charity-event','school-university-event'],'free',false,84,320,7),
 ('noura-creates','Noura Creates','Lifestyle creator, 280K followers','Luxury lifestyle and food content for Dubai brands.','influencers-creators','instagram-creator','dubai','downtown-dubai',6000,array['English','Arabic'],array['content-shoot-campaign','product-launch','brand-activation'],'medium',false,91,340,15),
 ('glow-hosts','Glow Event Hosts','Multilingual hostesses & ambassadors','Trained hosts for exhibitions and VIP events.','hosts-models','event-hostess','dubai','expo-city-dubai',1200,array['English','Arabic','Russian'],array['exhibition','conference','brand-activation'],'medium',false,90,50,19),
 ('dr-rashid','Dr. Rashid Al Mansoori','Keynote speaker on future of work','Former tech exec speaking on leadership and AI.','speakers','motivational-speaker','dubai','dubai-internet-city',15000,array['English','Arabic'],array['conference','corporate-event','school-university-event'],'pro',false,93,230,21),
 ('lens-and-light','Lens & Light Studio','Wedding & event photography','Editorial-style photo and film coverage.','photo-video','event-photographer','dubai','jumeirah-village-circle',5200,array['English'],array['wedding','corporate-event','birthday-party'],'medium',false,92,40,17),
 ('sky-drone-uae','Sky Drone UAE','Licensed drone filming','GCAA-licensed aerial filming for events and real estate.','photo-video','drone-operator','dubai','dubai-south',2800,array['English','Arabic'],array['content-shoot-campaign','wedding','exhibition'],'free',false,79,210,4),
 ('balloon-buddy','Balloon Buddy','Balloon twisting & face painting','Happy kids guaranteed at birthdays and fun days.','kids-entertainment','balloon-artist','dubai','arabian-ranches',700,array['English'],array['kids-party','birthday-party','school-university-event'],'free',false,83,55,10)
) as x(slug,name,tagline,bio,cat,sub,em,area,price,langs,evs,plan,featured,resp,hue,months)
join public.categories c on c.slug = x.cat
join public.subcategories s on s.category_id = c.id and s.slug = x.sub
join public.emirates e on e.slug = x.em
join public.areas ar on ar.emirate_id = e.id and ar.slug = x.area;

insert into public.stat_visibility(artist_id, revenue_mode, show_repeat)
select id, case when slug in ('dj-falcon','the-great-zayan') then 'exact' when slug in ('noura-creates','dr-rashid','funny-fatima') then 'hidden' else 'range' end,
  slug <> 'sax-after-dark' from public.artists;

insert into public.rate_cards(artist_id, title, description, price, duration_minutes, sort)
select a.id, p.title, p.descr, round(a.base_price * p.mult / 50) * 50, p.dur, p.ord from public.artists a,
(values ('Essential','Core performance, standard setup',1.0,60,1),('Signature','Extended set with premium extras',1.7,120,2),('Grand','Full experience, tailored for large events',2.6,240,3)) p(title,descr,mult,dur,ord);

insert into public.artist_badges(artist_id, badge)
select id, 'verified_identity' from public.artists where plan in ('pro','medium');
insert into public.artist_badges(artist_id, badge)
select id, 'verified_performer' from public.artists where plan = 'pro';
insert into public.artist_badges(artist_id, badge)
select id, 'top_performer' from public.artists where slug in ('layla-noor','dj-falcon','the-great-zayan','marina-strings');

-- seeded bookings (deterministic)
select setseed(0.42);
insert into public.bookings(artist_id, client_name, event_type_id, event_date, amount, status, is_seed, created_at)
select a.id,
  (array['Atlantis Events','Emaar Hospitality','Sara & Ahmed','Jumeirah Group','Noor Weddings','Brandly FZ-LLC','Khalid M.','Priya S.','Hana K.','Desert Rose Events','Marriott Marquis','TechHub DMCC'])[1 + (g % 12)],
  (select id from public.event_types order by sort offset (g % 22) limit 1),
  (now() - ((g * 7 + (random()*20)::int) || ' days')::interval)::date,
  round(a.base_price * (1 + random()*1.5) / 50) * 50,
  case when random() < 0.82 then 'completed' when random() < 0.5 then 'cancelled' else 'confirmed' end,
  true, now() - ((g * 7) || ' days')::interval
from public.artists a, generate_series(1, 40) g
where g <= case a.plan when 'pro' then 40 when 'medium' then 22 else 8 end;

insert into public.reviews(artist_id, booking_id, client_name, event_label, rating, body, reply, status, is_seed, created_at)
select b.artist_id, b.id, b.client_name, et.name,
  case when random() < 0.72 then 5 when random() < 0.7 then 4 when random() < 0.6 then 3 else 2 end,
  (array['Absolutely incredible — our guests are still talking about it.','Professional, punctual and so talented. Highly recommended.','Made our night unforgettable. Will book again for sure!','Great energy and perfectly tailored to our crowd.','Good performance, arrived a little late but delivered.','Communication was smooth from quote to the event day.','Exceeded expectations, worth every dirham.','رائع جداً، أداء احترافي والتزام بالمواعيد. أنصح به بشدة.'])[1 + floor(random()*8)::int],
  case when random() < 0.3 then 'Thank you so much — it was a pleasure performing for you!' end,
  'published', true, b.event_date + 2
from public.bookings b left join public.event_types et on et.id = b.event_type_id
where b.status = 'completed' and random() < 0.55;
