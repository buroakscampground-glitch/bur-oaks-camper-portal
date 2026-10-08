#!/usr/bin/env node

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const productionProjectRef = 'mzywctpxnpejglnspyqi'
const expectedUrl = `https://${productionProjectRef}.supabase.co`
const archiveMagic = Buffer.from('BUROAKS-STORAGE1')
const saltBytes = 32
const ivBytes = 12
const authTagBytes = 16
const headerBytes = archiveMagic.length + saltBytes + ivBytes

function fail(message) {
  throw new Error(`Blocked: ${message}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function hashFile(file) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

function safeObjectPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  if (!normalized || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
    fail('Storage returned an unsafe object path')
  }
  return parts.join('/')
}

function runTar(args, description) {
  const result = spawnSync('tar', args, { encoding: 'utf8' })
  if (result.status !== 0) fail(`${description} failed: ${(result.stderr || result.stdout || 'unknown tar error').trim()}`)
}

async function encryptArchive(source, destination, passphrase) {
  const salt = randomBytes(saltBytes)
  const iv = randomBytes(ivBytes)
  const key = scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 })
  output.write(Buffer.concat([archiveMagic, salt, iv]))
  await pipeline(createReadStream(source), cipher, output)
  await appendFile(destination, cipher.getAuthTag(), { mode: 0o600 })
}

async function decryptArchive(source, destination, passphrase) {
  const archive = await stat(source)
  if (archive.size <= headerBytes + authTagBytes) fail('encrypted archive is incomplete')

  const header = Buffer.alloc(headerBytes)
  const tag = Buffer.alloc(authTagBytes)
  const handle = await import('node:fs/promises').then(({ open }) => open(source, 'r'))
  try {
    await handle.read(header, 0, header.length, 0)
    await handle.read(tag, 0, tag.length, archive.size - authTagBytes)
  } finally {
    await handle.close()
  }

  if (!header.subarray(0, archiveMagic.length).equals(archiveMagic)) fail('archive does not have the Bur Oaks encrypted-backup header')
  const salt = header.subarray(archiveMagic.length, archiveMagic.length + saltBytes)
  const iv = header.subarray(archiveMagic.length + saltBytes)
  const key = scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  await pipeline(
    createReadStream(source, { start: headerBytes, end: archive.size - authTagBytes - 1 }),
    decipher,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  )
}

async function verifyEncryptedArchive(archiveFile, passphrase, workspace) {
  const decryptedTar = path.join(workspace, 'verified.tar.gz')
  const extracted = path.join(workspace, 'verified')
  await mkdir(extracted, { recursive: true, mode: 0o700 })
  await decryptArchive(archiveFile, decryptedTar, passphrase)

  const listing = spawnSync('tar', ['-tzf', decryptedTar], { encoding: 'utf8' })
  if (listing.status !== 0) fail(`encrypted archive did not contain a readable tarball: ${(listing.stderr || '').trim()}`)
  for (const entry of listing.stdout.split('\n').filter(Boolean)) {
    const normalized = entry.replace(/^\.\//, '')
    if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) fail('encrypted archive contains an unsafe extraction path')
  }

  runTar(['-xzf', decryptedTar, '-C', extracted], 'Encrypted archive verification')
  const manifest = JSON.parse(await readFile(path.join(extracted, 'payload', 'manifest.json'), 'utf8'))
  let bytes = 0
  for (const object of manifest.objects) {
    const objectFile = path.join(extracted, 'payload', 'objects', object.bucket, safeObjectPath(object.path))
    const objectStat = await lstat(objectFile)
    if (!objectStat.isFile() || objectStat.size !== object.bytes) fail(`restored object size mismatch for ${object.bucket}`)
    if (await hashFile(objectFile) !== object.sha256) fail(`restored object checksum mismatch for ${object.bucket}`)
    bytes += objectStat.size
  }
  if (bytes !== manifest.totalBytes || manifest.objects.length !== manifest.objectCount) fail('restored manifest totals do not match')
  return manifest
}

async function listObjects(bucket, prefix = '') {
  const objects = []
  let offset = 0
  while (true) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) fail(`could not list Storage prefix ${prefix || '/'}: ${error.message}`)
    const page = data || []
    for (const entry of page) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) objects.push(safeObjectPath(objectPath))
      else objects.push(...await listObjects(bucket, safeObjectPath(objectPath)))
    }
    if (page.length < 1000) break
    offset += page.length
  }
  return objects
}

async function main() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const passphrase = process.env.BUR_OAKS_STORAGE_BACKUP_PASSPHRASE || ''
  const destination = path.resolve(process.env.BUR_OAKS_STORAGE_BACKUP_DIRECTORY || '')
  const confirmation = process.env.BUR_OAKS_STORAGE_BACKUP_CONFIRM_PROJECT || ''

  if (supabaseUrl !== expectedUrl) fail(`NEXT_PUBLIC_SUPABASE_URL must be the reviewed production project ${productionProjectRef}`)
  if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is required at runtime and must never be saved in source control')
  if (confirmation !== productionProjectRef) fail(`set BUR_OAKS_STORAGE_BACKUP_CONFIRM_PROJECT=${productionProjectRef} for this run only`)
  if (passphrase.length < 20) fail('BUR_OAKS_STORAGE_BACKUP_PASSPHRASE must contain at least 20 characters')
  if (!process.env.BUR_OAKS_STORAGE_BACKUP_DIRECTORY) fail('choose an existing external backup directory explicitly')

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const forbiddenRoots = [
    repositoryRoot,
    path.resolve(tmpdir()),
    path.resolve('/tmp'),
    path.resolve('/private/tmp'),
    path.resolve('/var/tmp'),
    path.resolve('/private/var/tmp'),
    path.join(homedir(), 'Downloads'),
    path.parse(destination).root,
  ]
  if (forbiddenRoots.some((root) => destination === root || destination.startsWith(`${root}${path.sep}`))) {
    fail('backup destination must be outside the repository, temporary folders, and filesystem root')
  }
  const destinationStat = await stat(destination).catch(() => null)
  if (!destinationStat?.isDirectory()) fail('backup destination must already exist; the command will not guess or create it')

  const workspace = await mkdtemp(path.join(tmpdir(), 'bur-oaks-storage-backup-'))
  await chmod(workspace, 0o700)
  const payload = path.join(workspace, 'payload')
  const objectsRoot = path.join(payload, 'objects')
  await mkdir(objectsRoot, { recursive: true, mode: 0o700 })
  const createdAt = new Date().toISOString()
  const stamp = createdAt.replaceAll(':', '-').replace('.000Z', 'Z')
  const finalFile = path.join(destination, `bur-oaks-storage-${stamp}.bo-storage.aes`)
  const partialFile = `${finalFile}.partial`
  const tarFile = path.join(workspace, 'payload.tar.gz')

  try {
    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: buckets, error: bucketError } = await client.storage.listBuckets()
    if (bucketError) fail(`could not list Storage buckets: ${bucketError.message}`)
    if (!buckets?.length) fail('production returned no Storage buckets; refusing to create a misleading empty backup')

    const manifest = {
      format: 1,
      sourceProject: productionProjectRef,
      createdAt,
      objectCount: 0,
      totalBytes: 0,
      buckets: [],
      objects: [],
    }

    for (const bucketInfo of [...buckets].sort((a, b) => a.name.localeCompare(b.name))) {
      const bucket = client.storage.from(bucketInfo.name)
      const objectPaths = await listObjects(bucket)
      manifest.buckets.push({ name: bucketInfo.name, public: Boolean(bucketInfo.public), objectCount: objectPaths.length })
      for (const objectPath of objectPaths) {
        const { data, error } = await bucket.download(objectPath)
        if (error || !data) fail(`could not download an object from ${bucketInfo.name}: ${error?.message || 'empty response'}`)
        const bytes = Buffer.from(await data.arrayBuffer())
        const destinationFile = path.join(objectsRoot, safeObjectPath(bucketInfo.name), objectPath)
        await mkdir(path.dirname(destinationFile), { recursive: true, mode: 0o700 })
        await writeFile(destinationFile, bytes, { mode: 0o600 })
        manifest.objects.push({ bucket: bucketInfo.name, path: objectPath, bytes: bytes.length, sha256: sha256(bytes) })
        manifest.objectCount += 1
        manifest.totalBytes += bytes.length
      }
    }

    await writeFile(path.join(payload, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    runTar(['-czf', tarFile, '-C', workspace, 'payload'], 'Storage archive creation')
    await encryptArchive(tarFile, partialFile, passphrase)
    const verified = await verifyEncryptedArchive(partialFile, passphrase, workspace)
    await rename(partialFile, finalFile)
    const receipt = {
      format: verified.format,
      sourceProject: verified.sourceProject,
      createdAt: verified.createdAt,
      objectCount: verified.objectCount,
      totalBytes: verified.totalBytes,
      bucketCount: verified.buckets.length,
      archive: path.basename(finalFile),
      archiveSha256: await hashFile(finalFile),
      verified: true,
    }
    await writeFile(`${finalFile}.receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    console.log(`Verified encrypted Storage backup: ${finalFile}`)
    console.log(`Buckets ${receipt.bucketCount}; objects ${receipt.objectCount}; bytes ${receipt.totalBytes}; SHA-256 ${receipt.archiveSha256}`)
  } finally {
    await rm(partialFile, { force: true })
    await rm(workspace, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
