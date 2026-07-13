ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.command_results;
ALTER TABLE public.agents REPLICA IDENTITY FULL;
ALTER TABLE public.agent_events REPLICA IDENTITY FULL;
ALTER TABLE public.command_results REPLICA IDENTITY FULL;