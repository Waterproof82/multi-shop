#!/usr/bin/env npx tsx

/**
 * Script to create a superadmin user
 * 
 * Usage:
 *   npx tsx scripts/create-superadmin.ts <email> <password> <name>
 * 
 * Example:
 *   npx tsx scripts/create-superadmin.ts superadmin@example.com MySecurePassword "Super Admin"
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:');
  if (!supabaseUrl) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createSuperAdmin(email: string, password: string, name: string) {
  console.log(`Creating superadmin: ${email}`);

  // 1. Create the auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
    },
  });

  if (authError) {
    console.error('Error creating auth user:', authError.message);
    process.exit(1);
  }

  if (!authData.user) {
    console.error('No user returned from auth creation');
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Auth user created: ${userId}`);

  // 2. Create the admin profile with superadmin role
  const { error: profileError } = await supabase
    .from('perfiles_admin')
    .insert({
      id: userId,
      empresa_id: null, // null for superadmin
      nombre_completo: name,
      rol: 'superadmin',
    });

  if (profileError) {
    console.error('Error creating admin profile:', profileError.message);
    console.log('Cleaning up auth user...');
    await supabase.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  console.log('Superadmin created successfully!');
  console.log('');
  console.log('You can now login at /admin/login with:');
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
}

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: npx tsx scripts/create-superadmin.ts <email> <password> <name>');
  console.log('');
  console.log('Example:');
  console.log('  npx tsx scripts/create-superadmin.ts superadmin@example.com MySecurePassword "Super Admin"');
  process.exit(1);
}

const [email, password, name] = args;

createSuperAdmin(email, password, name).catch(console.error);
