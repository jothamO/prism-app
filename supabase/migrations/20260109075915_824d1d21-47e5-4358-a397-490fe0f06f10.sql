-- Drop the existing incomplete policy
DROP POLICY IF EXISTS compliance_rules_update_policy ON compliance_rules;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY compliance_rules_update_policy ON compliance_rules
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));