-- Fix tax_deadlines foreign key to allow rule deletion during reprocess
ALTER TABLE tax_deadlines 
DROP CONSTRAINT IF EXISTS tax_deadlines_source_rule_id_fkey;

ALTER TABLE tax_deadlines 
ADD CONSTRAINT tax_deadlines_source_rule_id_fkey 
FOREIGN KEY (source_rule_id) 
REFERENCES compliance_rules(id) 
ON DELETE SET NULL;

-- Fix compliance_change_log foreign key to allow document deletion
ALTER TABLE compliance_change_log 
DROP CONSTRAINT IF EXISTS compliance_change_log_source_document_id_fkey;

ALTER TABLE compliance_change_log 
ADD CONSTRAINT compliance_change_log_source_document_id_fkey 
FOREIGN KEY (source_document_id) 
REFERENCES legal_documents(id) 
ON DELETE SET NULL;