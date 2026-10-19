import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { createTutorHandler } from '../english-tutor/handler.mjs';
import * as curriculum from './core.mjs';

Deno.serve(createTutorHandler({ createClient, env: (name: string) => Deno.env.get(name), curriculum }));
