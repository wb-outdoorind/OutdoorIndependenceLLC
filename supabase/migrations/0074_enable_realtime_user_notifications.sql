-- Enable realtime change events for in-app notification sync/toasts.
do $$
begin
  begin
    alter publication supabase_realtime add table public.user_notifications;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end
$$;
