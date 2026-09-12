# CloudFront Frontends

Connect an S3 bucket node to a CloudFront distribution node. Publish resolves
the bucket reference and creates a private S3 REST origin using Origin Access
Control (OAC), HTTPS redirects, and managed security headers. The resource details
show the distribution ID, ARN, HTTPS URL, and AWS propagation status.

The bucket must be in the sketch connection's region and use SSE-S3. CloudFront
API calls use us-east-1 because distributions are global. Existing bucket policy
statements are preserved; the distribution receives its own scoped read grant.
Public access is blocked on the origin bucket.

Supported updates: origin path, default document, description, enabled state,
price class, caching mode, and SPA fallback. Changing the origin bucket requires
a replacement distribution. Caching defaults to disabled; optimized caching uses
the AWS managed policy. Publish creates the bucket before creating its connected
distribution and waits for the bucket to become available. Once the bucket is
running, open its node to upload files or folders, create folders, browse objects,
and delete them. Files go directly to S3 using a short-lived signed POST; the
server only signs the upload and lists metadata. Each upload is limited to 100 MB.
Set `FRONTEND_URL` to the web app origin so uploads can configure S3 CORS.
This integration does not build code, configure custom domains or access logs,
or support KMS-encrypted origins. Optimized caching can keep earlier files at
edge locations until they expire; use disabled caching while iterating.

Deletion first disables the distribution. Resource polling waits for propagation,
then deletes it and its OAC and removes its bucket-policy grant. Keep the workspace
open for polling or retry deletion later. Sketch deletion returns a pending message
without deleting the origin prematurely; retry once the distribution is terminated.
Failed setup/cleanup remains visible for explicit retry or deletion.

The connection needs CloudFront distribution create/get/update/delete, managed
cache and response-header policy listing, and OAC create/get/delete permissions.
It also needs s3:GetEncryptionConfiguration, s3:PutBucketPublicAccessBlock,
s3:GetBucketPolicy, s3:PutBucketPolicy, and s3:DeleteBucketPolicy on the origin.
Browsing and content management need s3:ListBucket, s3:PutObject and
s3:DeleteObject. Browser uploads also need s3:GetBucketCORS and
s3:PutBucketCORS; existing CORS rules are preserved. Existing S3 creation
permissions remain separate.

Tests mock AWS calls; live deployment and CDN delivery have not been verified.
