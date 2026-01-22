-- Clear Part 2 rules for targeted reprocessing
DELETE FROM compliance_rules 
WHERE source_part_id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';

-- Reset Part 2 status to allow reprocessing
UPDATE document_parts 
SET status = 'pending', rules_count = 0, provisions_count = 0, processed_at = NULL
WHERE id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';