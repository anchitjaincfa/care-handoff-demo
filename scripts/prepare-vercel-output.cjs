'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getTransformedRoutes } = require('@vercel/routing-utils');

const root = process.cwd();
const sourceRoot = path.join(root, 'out');
const vercelRoot = path.join(root, '.vercel');
const outputRoot = path.join(vercelRoot, 'output');
const staticRoot = path.join(outputRoot, 'static');
const vercelConfigPath = path.join(root, 'vercel.json');

if (!fs.statSync(sourceRoot).isDirectory()) {
  throw new Error('out must be a directory');
}

if (fs.existsSync(outputRoot)) {
  throw new Error('.vercel/output must not pre-exist');
}

const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
const routeKeys = [
  'routes',
  'cleanUrls',
  'rewrites',
  'redirects',
  'headers',
  'trailingSlash',
];
const routeInput = Object.fromEntries(
  routeKeys
    .filter((key) => Object.hasOwn(vercelConfig, key))
    .map((key) => [key, vercelConfig[key]]),
);
const transformed = getTransformedRoutes(routeInput);

if (transformed.error) {
  throw new Error(
    `Invalid Vercel routing configuration: ${JSON.stringify(transformed.error)}`,
  );
}

if (!Array.isArray(transformed.routes)) {
  throw new Error('Expected transformed Vercel routes');
}

function listRegularFiles(directory, prefix = '') {
  const files = [];

  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const stat = fs.lstatSync(absolute);

    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink is forbidden in deployment output: ${relative}`);
    }

    if (stat.isDirectory()) {
      files.push(...listRegularFiles(absolute, relative));
      continue;
    }

    if (!stat.isFile()) {
      throw new Error(`Non-regular deployment entry is forbidden: ${relative}`);
    }

    files.push(relative);
  }

  return files;
}

function treeDigest(directory, files) {
  const hash = crypto.createHash('sha256');

  for (const relative of files) {
    const content = fs.readFileSync(
      path.join(directory, ...relative.split('/')),
    );

    hash.update(relative, 'utf8');
    hash.update('\0');
    hash.update(String(content.byteLength), 'utf8');
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

const files = listRegularFiles(sourceRoot);

if (files.length === 0) {
  throw new Error('Static export is empty');
}

const sourceDigest = treeDigest(sourceRoot, files);
fs.mkdirSync(staticRoot, { recursive: true });

for (const relative of files) {
  const source = path.join(sourceRoot, ...relative.split('/'));
  const destination = path.join(staticRoot, ...relative.split('/'));

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const copiedFiles = listRegularFiles(staticRoot);
const copiedDigest = treeDigest(staticRoot, copiedFiles);

if (files.length !== copiedFiles.length || sourceDigest !== copiedDigest) {
  throw new Error('Static tree changed while creating Build Output package');
}

const outputConfig = {
  version: 3,
  routes: transformed.routes,
};
const serializedConfig = `${JSON.stringify(outputConfig, null, 2)}\n`;

fs.writeFileSync(path.join(outputRoot, 'config.json'), serializedConfig, {
  flag: 'wx',
});

const configDigest = `sha256:${crypto
  .createHash('sha256')
  .update(serializedConfig)
  .digest('hex')}`;

process.stdout.write(
  `${JSON.stringify({
    version: 3,
    fileCount: files.length,
    staticTreeDigest: copiedDigest,
    configDigest,
  })}\n`,
);
