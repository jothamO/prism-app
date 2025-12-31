-- Create related_parties table for storing user-declared connected persons
CREATE TABLE public.related_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  party_name VARCHAR NOT NULL,
  party_tin VARCHAR,
  relationship_type VARCHAR NOT NULL, -- 'family', 'partner', 'controlled_entity', 'trust', 'director', 'shareholder'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.related_parties ENABLE ROW LEVEL SECURITY;

-- Users can view their own related parties
CREATE POLICY "Users can view their own related parties"
ON public.related_parties
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Users can create their own related parties
CREATE POLICY "Users can create their own related parties"
ON public.related_parties
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own related parties
CREATE POLICY "Users can update their own related parties"
ON public.related_parties
FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own related parties
CREATE POLICY "Users can delete their own related parties"
ON public.related_parties
FOR DELETE
USING (user_id = auth.uid());

-- Admins can manage all related parties
CREATE POLICY "Admins can manage all related parties"
ON public.related_parties
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_related_parties_updated_at
BEFORE UPDATE ON public.related_parties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();