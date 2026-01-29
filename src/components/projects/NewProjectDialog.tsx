import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface NewProjectDialogProps {
    onProjectCreated: () => void;
}

export default function NewProjectDialog({ onProjectCreated }: NewProjectDialogProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        source_person: '',
        source_relationship: 'client',
        budget: '',
        tax_treatment: 'non_taxable',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!formData.name || !formData.budget) {
            toast({
                title: 'Validation Error',
                description: 'Project name and budget are required',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        try {
            // Get user's internal ID
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (!userData) {
                throw new Error('User not found');
            }

            const { error } = await supabase.from('projects').insert({
                user_id: userData.id,
                name: formData.name,
                description: formData.description || null,
                source_person: formData.source_person || null,
                source_relationship: formData.source_relationship,
                budget: parseFloat(formData.budget),
                spent: 0,
                status: 'active',
                tax_treatment: formData.tax_treatment,
                is_agency_fund: formData.tax_treatment === 'non_taxable',
                exclude_from_vat: true,
            });

            if (error) throw error;

            toast({
                title: 'Project Created',
                description: `"${formData.name}" has been created successfully`,
            });

            // Reset form
            setFormData({
                name: '',
                description: '',
                source_person: '',
                source_relationship: 'client',
                budget: '',
                tax_treatment: 'non_taxable',
            });
            setOpen(false);
            onProjectCreated();
        } catch (error) {
            console.error('Error creating project:', error);
            toast({
                title: 'Error',
                description: 'Failed to create project. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Project
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                        <DialogDescription>
                            Track third-party or agency funds separately from your income.
                            These funds are typically non-taxable under Section 5 NTA 2025.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Project Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g., Johnson Wedding Photography"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Brief description of the project..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={2}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="source_person">Fund Source</Label>
                                <Input
                                    id="source_person"
                                    placeholder="Client/Company name"
                                    value={formData.source_person}
                                    onChange={(e) => setFormData({ ...formData, source_person: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="source_relationship">Relationship</Label>
                                <Select
                                    value={formData.source_relationship}
                                    onValueChange={(value) => setFormData({ ...formData, source_relationship: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="client">Client</SelectItem>
                                        <SelectItem value="employer">Employer</SelectItem>
                                        <SelectItem value="partner">Partner</SelectItem>
                                        <SelectItem value="family">Family</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="budget">Budget (₦) *</Label>
                                <Input
                                    id="budget"
                                    type="number"
                                    placeholder="500000"
                                    value={formData.budget}
                                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                                    required
                                    min="0"
                                    step="100"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="tax_treatment">Tax Treatment</Label>
                                <Select
                                    value={formData.tax_treatment}
                                    onValueChange={(value) => setFormData({ ...formData, tax_treatment: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="non_taxable">Non-Taxable (Agency Fund)</SelectItem>
                                        <SelectItem value="taxable_income">Taxable Income</SelectItem>
                                        <SelectItem value="mixed">Mixed Treatment</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Create Project
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
