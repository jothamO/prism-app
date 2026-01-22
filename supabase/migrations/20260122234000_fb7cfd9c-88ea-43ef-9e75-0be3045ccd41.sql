-- Fix legal_provisions check constraint to accept all provision types
ALTER TABLE legal_provisions 
DROP CONSTRAINT IF EXISTS legal_provisions_provision_type_check;

ALTER TABLE legal_provisions 
ADD CONSTRAINT legal_provisions_provision_type_check 
CHECK (provision_type = ANY (ARRAY[
    'definition', 'obligation', 'exemption', 'rate', 
    'threshold', 'penalty', 'procedure', 'deadline', 
    'relief', 'power', 'general', 'other'
]));

-- Fix compliance_rules check constraint to accept all rule types including tax_band
ALTER TABLE compliance_rules 
DROP CONSTRAINT IF EXISTS compliance_rules_rule_type_check;

ALTER TABLE compliance_rules 
ADD CONSTRAINT compliance_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY[
    'tax_rate', 'tax_band', 'threshold', 'relief', 
    'exemption', 'penalty', 'deadline', 'filing_deadline', 
    'vat_rate', 'emtl', 'procedure'
]));

-- Clear Part 2 rules to allow fresh extraction with tax_band support
DELETE FROM compliance_rules 
WHERE source_part_id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';

-- Reset Part 2 status for reprocessing
UPDATE document_parts 
SET status = 'pending', rules_count = 0, provisions_count = 0
WHERE id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';