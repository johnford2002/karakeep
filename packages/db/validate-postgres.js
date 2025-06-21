#!/usr/bin/env node

/**
 * Simple validation script to test PostgreSQL support
 * This script validates that the configuration and imports work correctly
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

async function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'pipe',
      env: { ...process.env, ...env }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject({ code, stdout, stderr });
      }
    });
  });
}

async function validatePostgresSupport() {
  console.log('🔍 Validating PostgreSQL support...\n');
  
  try {
    // Test 1: SQLite configuration (default)
    console.log('1. Testing SQLite configuration...');
    await runCommand('pnpm', ['typecheck'], { DB_TYPE: 'sqlite' });
    console.log('   ✅ SQLite configuration works\n');
    
    // Test 2: PostgreSQL configuration
    console.log('2. Testing PostgreSQL configuration...');
    await runCommand('pnpm', ['typecheck'], { DB_TYPE: 'postgres' });
    console.log('   ✅ PostgreSQL configuration works\n');
    
    // Test 3: Migration generation for SQLite
    console.log('3. Testing SQLite migration generation...');
    await runCommand('pnpm', ['generate'], { DB_TYPE: 'sqlite' });
    console.log('   ✅ SQLite migrations work\n');
    
    // Test 4: Migration generation for PostgreSQL
    console.log('4. Testing PostgreSQL migration generation...');
    await runCommand('pnpm', ['generate'], { DB_TYPE: 'postgres' });
    console.log('   ✅ PostgreSQL migrations work\n');
    
    // Test 5: Check files exist
    console.log('5. Checking generated files...');
    await fs.access('./drizzle/');
    await fs.access('./drizzle-postgres/');
    await fs.access('./schema.ts');
    await fs.access('./schema-postgres.ts');
    console.log('   ✅ All required files exist\n');
    
    console.log('🎉 All tests passed! PostgreSQL support is working correctly.');
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run validation
validatePostgresSupport().catch(console.error);