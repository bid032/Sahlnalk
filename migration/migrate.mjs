#!/usr/bin/env node
/**
 * سكريبت ترحيل كامل من Supabase الحالي لمشروع Supabase جديد
 *
 * بيعمل 3 حاجات:
 * 1. ينقل المستخدمين (auth.users) مع الحفاظ على نفس الـ UUID
 * 2. يشغل ملفات الـ Schema والـ Data والـ Post-Schema
 * 3. يعمل Storage buckets و Realtime
 *
 * طريقة التشغيل:
 * 1. اعمل نسخة من .env.example وسميها .env
 * 2. املأ القيم من Supabase الجديد
 * 3. افتح Terminal في فولدر migration
 * 4. اكتب: node migrate.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const {
  NEW_SUPABASE_URL,
  NEW_SUPABASE_SERVICE_ROLE_KEY,
  NEW_SUPABASE_DB_URL,
} = process.env;

function required(name, value) {
  if (!value) {
    console.error(`❌ متغير مفقود: ${name}`);
    console.error('افتح ملف .env واتأكد إنك مليت كل القيم');
    process.exit(1);
  }
}

required('NEW_SUPABASE_URL', NEW_SUPABASE_URL);
required('NEW_SUPABASE_SERVICE_ROLE_KEY', NEW_SUPABASE_SERVICE_ROLE_KEY);
required('NEW_SUPABASE_DB_URL', NEW_SUPABASE_DB_URL);


const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runPsql(fileName) {
  const filePath = path.join(__dirname, fileName);
  console.log(`\n▶️ شغّل ${fileName} ...`);

  return new Promise((resolve, reject) => {
    const proc = spawn('psql', [NEW_SUPABASE_DB_URL, '-f', filePath], {
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${fileName} اكتمل`);
        resolve();
      } else {
        reject(new Error(`فشل ${fileName} (code ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`مش قادر أشغّل psql: ${err.message}`));
    });
  });
}

async function migrateUsers() {
  console.log('\n🔑 جاري نقل المستخدمين ...');

  const usersFile = path.join(__dirname, 'users.json');
  let users = [];
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    users = JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️ مفيش ملف users.json -هيتم تخطي نقل المستخدمين. (${err.message})`);
    return;
  }

  console.log(`ℹ️ لقيت ${users.length} مستخدم في users.json`);

  let created = 0, skipped = 0, failed = 0;

  for (const user of users) {
    try {
      const { data: existing } = await newSupabase.auth.admin.getUserById(user.id);
      if (existing?.user) {
        console.log(`⏭️ موجود: ${user.email}`);
        skipped++;
        continue;
      }
    } catch { }

    try {
      const { error } = await newSupabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: 'TempPassword123!ChangeMe',
        email_confirm: true,
        user_metadata: user.raw_user_meta_data || {},
      });
      if (error) throw error;
      console.log(`✅ اتنقل: ${user.email}`);
      created++;
    } catch (err) {
      console.error(`❌ فشل نقل ${user.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 المستخدمين: ${created} اتنقلوا، ${skipped} موجودين، ${failed} فشلوا`);
  if (created > 0) {
    console.log('\n⚠️ الباسورد المؤقت: TempPassword123!ChangeMe');
    console.log('اليوزرز يستخدموا "نسيت كلمة السر" في الموقع الجديد.');
  }
}


async function main() {
  console.log('🚀 بدء ترحيل Supabase ...');

  // 1. نقل المستخدمين الأول
  await migrateUsers();

  // 2. تشغيل الـ Schema
  await runPsql('01_schema.sql');

  // 3. تشغيل البيانات
  await runPsql('02_data.sql');

  // 4. الإعدادات النهائية
  await runPsql('03_post_schema.sql');

  console.log('\n🎉 الترحيل اكتمل!');
  console.log('الخطوات الجاية:');
  console.log('1. انقل الصور من Storage القديم للجديد يدوياً');
  console.log('2. حدّث ملف .env في المشروع بالقيم الجديدة');
  console.log('3. شغّل الموقع واختبره');
}

main().catch((err) => {
  console.error('\n💥 حصل خطأ:', err.message);
  process.exit(1);
});
