-- Add Sales as a valid department in workflow tables that enforce department checks.

do $$
begin
  if to_regclass('public.purchase_requests') is not null then
    alter table public.purchase_requests
      drop constraint if exists purchase_requests_department_check;

    alter table public.purchase_requests
      add constraint purchase_requests_department_check
      check (
        department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance', 'Sales')
      );
  end if;

  if to_regclass('public.academy_training_programs') is not null then
    alter table public.academy_training_programs
      drop constraint if exists academy_training_programs_department_check;

    alter table public.academy_training_programs
      add constraint academy_training_programs_department_check
      check (
        department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance', 'Sales')
      );
  end if;

  if to_regclass('public.academy_training_enrollments') is not null then
    alter table public.academy_training_enrollments
      drop constraint if exists academy_training_enrollments_department_check;

    alter table public.academy_training_enrollments
      add constraint academy_training_enrollments_department_check
      check (
        department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance', 'Sales')
      );
  end if;
end
$$;
