# 4. Delivery photos and driver documents use short-lived signed URLs, not a public bucket

## Context

Proof-of-delivery photos and driver compliance documents (national ID,
license, etc.) were originally stored in a bucket configured for
anonymous public read (`mc anonymous set download`), with the plain
public URL stored directly in the database (`delivery_confirmations.photo_url`,
`driver_documents.file_url`) and handed straight to clients.

## Decision

The bucket is private. `fleet_vehicles`-style plain-URL storage was
replaced with storing the object's storage **key** in those same columns,
and generating a fresh, short-lived (15 minute) signed GET URL at
response time via `config/r2Client.js`'s `toSignedUrl()`, every time a
client actually needs to view one.

## Consequences

- Anyone who obtained or guessed a stored URL previously had unauthenticated
  read access to a driver's ID document or a delivery's proof photo
  forever. Now, a URL is only ever valid for 15 minutes from when it was
  actually requested through an authenticated API call.
- Every response endpoint that returns one of these URLs
  (`getMyCompletedDeliveries`, `getRecentDeliveries`, `getMyDocuments`,
  `getAllDocuments`, and `confirmDelivery`'s own response/socket-emit) now
  does a presign step at response time — a small latency cost per row,
  accepted in exchange for the URLs not being permanently valid.
- **Do not persist a signed URL anywhere** (a database column, a cached
  response) — it will silently stop working after 15 minutes. Always
  persist the object key, and presign fresh at the point of use.
- For local dev with MinIO specifically, presigning requires signing
  against the same host a browser/phone will actually hit
  (`R2_PUBLIC_URL_BASE`'s origin), not the internal Docker-network
  hostname used for uploads — see the comment above `derivePresignEndpoint()`
  in `config/r2Client.js` for why two separate S3 client instances exist.
- Upload endpoints also now verify the actual file bytes (magic-number
  signature check, `assertRealFileType` in the same file) rather than
  trusting the client-supplied Content-Type/mimetype string alone.
