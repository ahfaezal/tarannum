-- Fix reference access in production
-- Run this SQL in Railway Postgres database

-- Make specific reference public
UPDATE references 
SET is_public = true 
WHERE id = 'ca8acbfa43f5def14355861746d9a541';

-- OR make all preset references public (recommended)
UPDATE references 
SET is_public = true 
WHERE is_preset = true;

-- OR make all references without owner public (demo content)
UPDATE references 
SET is_public = true 
WHERE owner_id IS NULL;

-- Verify the fix
SELECT id, title, is_public, is_preset, owner_id 
FROM references 
WHERE id = 'ca8acbfa43f5def14355861746d9a541';
