/**
 * One-off CLI to create a platform-admin account.
 *
 * Use this in production: SEED_PLATFORM_ADMIN_* env vars are blocked at server startup
 * (see backend/src/app.ts), so the only safe way to provision the first admin is via
 * this script run on the box.
 *
 * Usage:
 *   npm run platform:create-admin -- --email admin@tawafud.ai --name "Faris" --password 'StrongPass123!'
 *
 * If --password is omitted you'll be prompted (input is hidden, no shell history).
 *
 * Re-running with the same email rotates the password (and prints a confirmation).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

interface Args {
  email?: string;
  name?: string;
  password?: string;
  rotate?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (key === 'rotate') {
      args.rotate = true;
      continue;
    }
    if (!next || next.startsWith('--')) continue;
    if (key === 'email') args.email = next;
    else if (key === 'name') args.name = next;
    else if (key === 'password') args.password = next;
    i++;
  }
  return args;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (typeof (stdin as any).setRawMode !== 'function') {
      // Fallback for non-TTY environments — read visibly.
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk: string) => {
        buf += chunk;
        if (buf.includes('\n')) {
          stdin.pause();
          process.stdout.write('\n');
          resolve(buf.replace(/\r?\n.*$/, '').trim());
        }
      });
      return;
    }
    (stdin as any).setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let secret = '';
    const onData = (ch: string) => {
      if (ch === '\u0003') {
        // Ctrl+C
        process.stdout.write('\n');
        process.exit(130);
      }
      if (ch === '\r' || ch === '\n') {
        (stdin as any).setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(secret.trim());
        return;
      }
      if (ch === '\u007f' || ch === '\b') {
        if (secret.length > 0) {
          secret = secret.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      secret += ch;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

function isStrongPassword(p: string): { ok: boolean; reason?: string } {
  if (p.length < 12) return { ok: false, reason: 'Password must be at least 12 characters.' };
  const hasUpper = /[A-Z]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasNum = /[0-9]/.test(p);
  const hasSym = /[^A-Za-z0-9]/.test(p);
  if (!(hasUpper && hasLower && hasNum && hasSym)) {
    return { ok: false, reason: 'Password needs upper, lower, number, and symbol.' };
  }
  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const email = (args.email || (await prompt('Email: '))).toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid email required.');
    }
    const name = (args.name || (await prompt('Name: '))).trim() || 'Platform Admin';
    let password = args.password;
    if (!password) {
      password = await promptHidden('Password (hidden): ');
      const confirm = await promptHidden('Confirm password: ');
      if (password !== confirm) throw new Error('Passwords do not match.');
    }
    const strong = isStrongPassword(password);
    if (!strong.ok) throw new Error(strong.reason!);

    const hash = await bcrypt.hash(password, 12);
    const existing = await prisma.platformAdmin.findUnique({ where: { email } });

    if (existing && !args.rotate) {
      throw new Error(`Platform admin ${email} already exists. Re-run with --rotate to reset the password.`);
    }

    if (existing) {
      await prisma.platformAdmin.update({
        where: { email },
        data: { password: hash, name, isActive: true, lastLogin: new Date() },
      });
      console.log(`✓ Rotated password for ${email}`);
    } else {
      const created = await prisma.platformAdmin.create({
        data: { email, password: hash, name, isActive: true },
      });
      console.log(`✓ Created platform admin ${created.email} (${created.platformAdminId})`);
    }
  } catch (err: any) {
    console.error(`✗ ${err?.message ?? err}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
