/**
 * Runs before the server starts (docker/entrypoint.sh).
 *
 * Copies this build's static assets (scripts, styles, fonts — all named by content
 * hash) from ./static-build into ./.next/static. When a volume is mounted there,
 * the assets of earlier builds stay next to the new ones, so a page that was opened
 * just before an update can still load its scripts from the new server.
 *
 * Assets that no build has shipped for 30 days are deleted.
 */
import { copyFile, mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const SOURCE = "static-build";
const TARGET = ".next/static";
const KEEP_FOR_MS = 30 * 24 * 60 * 60 * 1000;

async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

const now = new Date();
let added = 0;
let removed = 0;

for (const source of await listFiles(SOURCE)) {
  const target = join(TARGET, relative(SOURCE, source));

  // Already published by an earlier build: just mark it as still in use.
  const exists = await utimes(target, now, now).then(
    () => true,
    () => false,
  );
  if (exists) continue;

  // Copy to a temp name, then rename: a server reading the folder never sees half a file.
  const temp = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, temp);
  await rename(temp, target);
  added += 1;
}

for (const file of await listFiles(TARGET)) {
  const info = await stat(file).catch(() => null);
  if (info && now.getTime() - info.mtimeMs > KEEP_FOR_MS) {
    await rm(file, { force: true });
    removed += 1;
  }
}

console.log(`[static] ${added} files added, ${removed} older than 30 days removed`);
