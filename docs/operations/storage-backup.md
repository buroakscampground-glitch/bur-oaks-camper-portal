# Independent Supabase Storage backup

Supabase database backups do not include objects stored in Supabase Storage. Bur Oaks therefore has a guarded export command that downloads every object from every production bucket, records a SHA-256 checksum and byte count for each object, encrypts the complete archive with authenticated AES-256-GCM encryption, decrypts it into an isolated temporary directory, and verifies every restored checksum before publishing the backup.

The command is deliberately not a Vercel route or scheduled function. A backup is independent only when its final archive is stored outside the production Supabase and Vercel accounts.

## Required destination

Choose an existing directory on an external encrypted drive or approved off-site folder. Do not use the repository, Downloads, a temporary directory, or the root of a disk. The command refuses those unsafe destinations and never creates or guesses a destination.

## Run safely

Obtain the production URL and service-role key through the approved secret-management path. Never paste the service-role key or backup passphrase into source code, `.env`, shell history, task notes, screenshots, or support messages.

Read the encryption passphrase silently and keep it available through the campground's approved recovery-secret process:

```sh
read -s 'BUR_OAKS_BACKUP_PASSPHRASE?Storage backup passphrase: '
NEXT_PUBLIC_SUPABASE_URL='https://mzywctpxnpejglnspyqi.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
BUR_OAKS_STORAGE_BACKUP_CONFIRM_PROJECT='mzywctpxnpejglnspyqi' \
BUR_OAKS_STORAGE_BACKUP_PASSPHRASE="$BUR_OAKS_BACKUP_PASSPHRASE" \
BUR_OAKS_STORAGE_BACKUP_DIRECTORY='/Volumes/Bur Oaks Backups' \
npm run storage:backup
unset BUR_OAKS_BACKUP_PASSPHRASE
```

The command writes two files only after the full round-trip verification succeeds:

- `bur-oaks-storage-<timestamp>.bo-storage.aes` — encrypted authenticated archive;
- the matching `.receipt.json` — object count, byte count, bucket count, timestamp, and encrypted archive checksum, with no object names or document contents.

If a bucket cannot be listed, an object cannot be downloaded, encryption fails, or a restored byte differs, the command fails closed and removes the temporary plaintext and partial archive. It never uploads, changes, or deletes a production object.

## Operator check

1. Confirm the command reports `Verified encrypted Storage backup`.
2. Confirm the archive and matching `receipt.json` exist at the external destination.
3. Confirm `verified` is `true` and record the archive SHA-256 in the restore-drill log.
4. Keep the passphrase separate from the archive. Losing it makes the backup intentionally unreadable.
5. Retain at least two verified generations in separate failure domains before expiring an older generation.

Never place the passphrase beside the archive. Never upload an unencrypted temporary folder. Never test restoration in production.
