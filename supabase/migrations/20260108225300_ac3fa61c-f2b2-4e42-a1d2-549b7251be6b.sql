-- Update documents bucket to allow application/octet-stream as fallback
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 
    'text/markdown',
    'application/octet-stream'
]
WHERE id = 'documents';