import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { supabase } from '@/integrations/supabase/client';
import { verifyToken } from '@/lib/auth.server';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');

    // Try Supabase auth first
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    let userId = user?.id;
    let claims: any = user;

    // Fallback to local JWT verify if needed
    if (!userId) {
      const decoded = verifyToken(token);
      if (decoded?.sub) {
        userId = decoded.sub;
        claims = decoded;
      }
    }

    if (!userId) {
      throw new Error('Unauthorized: Invalid or expired token');
    }

    return next({
      context: {
        userId,
        claims,
        supabase,
      },
    });
  }
);


