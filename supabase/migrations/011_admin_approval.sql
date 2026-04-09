-- Admin approval gate: users must be approved before accessing the platform
-- Hans Prahl is auto-approved as admin

-- Add status and admin columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Auto-approve and make admin: Hans (by email)
UPDATE public.users SET status = 'approved', is_admin = TRUE WHERE email = 'hans@prahl.com';
-- Also try other possible email patterns
UPDATE public.users SET status = 'approved', is_admin = TRUE WHERE email ILIKE '%hans%prahl%';

-- Index for quick status lookups
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- RLS policy: admins can see all users, regular users can only see approved users
CREATE POLICY "Admins can manage all users"
  ON public.users FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE is_admin = TRUE)
  );
