import jwt from 'jsonwebtoken';
import { supabase } from '@/integrations/supabase/client';

const JWT_SECRET = process.env.JWT_SECRET || 'rapidkeyz_super_secret_jwt_key_2026';

export interface UserPayload {
  sub: string;
  email: string;
  roles: string[];
}

export function generateToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (err) {
    return null;
  }
}

export async function getUserById(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const { data: rolesRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const roles = (rolesRows ?? []).map((r: any) => r.role);

  if (!profile) {
    return { id: userId, roles };
  }

  return {
    ...profile,
    roles,
  };
}

export async function getUserByEmail(email: string) {
  // Supabase profiles table does not contain email column (stored in auth.users)
  return null;
}


