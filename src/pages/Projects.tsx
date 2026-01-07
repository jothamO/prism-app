import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  ChevronRight,
  ArrowLeft,
  Receipt,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import ChatWidget from '@/components/ChatWidget';

interface Project {
  id: string;
  name: string;
  source_person: string | null;
  relationship: string | null;
  budget: number;
  spent: number;
  status: 'active' | 'completed' | 'cancelled';
  tax_treatment: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ProjectReceipt {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  category: string | null;
  receipt_url: string | null;
  created_at: string;
}

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [receipts, setReceipts] = useState<ProjectReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [user]);

  async function fetchProjects() {
    if (!user) return;
    setLoading(true);
    try {
      // First get user's internal ID from users table
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData) {
        setProjects([]);
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast({
        title: 'Error',
        description: 'Failed to load projects',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchProjectReceipts(projectId: string) {
    setLoadingReceipts(true);
    try {
      const { data, error } = await supabase
        .from('project_receipts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoadingReceipts(false);
    }
  }

  function handleProjectClick(project: Project) {
    setSelectedProject(project);
    fetchProjectReceipts(project.id);
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Active</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalSpent = projects.reduce((sum, p) => sum + (p.spent || 0), 0);
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <FolderKanban className="h-7 w-7 text-primary" />
              My Projects
            </h1>
            <p className="text-muted-foreground mt-1">Track project funds and expenses</p>
          </div>
        </div>
        <Button 
          onClick={() => toast({ 
            title: 'Create via Chat', 
            description: 'Use Telegram or WhatsApp to create projects. Send "new project" to the bot.' 
          })}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
            <p className="text-xs text-muted-foreground">Across all projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
            <p className="text-xs text-muted-foreground">
              {totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}% utilized` : '0% utilized'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
            <p className="text-xs text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedProjects}</div>
            <p className="text-xs text-muted-foreground">Projects finished</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Projects List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Click on a project to view details and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first project via Telegram or WhatsApp bot
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Send "new project" to start tracking project funds
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => {
                    const progress = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
                    const isOverBudget = progress > 100;
                    
                    return (
                      <button
                        key={project.id}
                        onClick={() => handleProjectClick(project)}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left",
                          selectedProject?.id === project.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground truncate">{project.name}</span>
                            {getStatusBadge(project.status)}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {project.source_person && (
                              <span>From: {project.source_person}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(project.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="mt-2">
                            <Progress 
                              value={Math.min(progress, 100)} 
                              className={cn("h-1.5", isOverBudget && "[&>div]:bg-red-500")}
                            />
                            <div className="flex justify-between text-xs mt-1">
                              <span className={cn(isOverBudget ? "text-red-500" : "text-muted-foreground")}>
                                {formatCurrency(project.spent)} spent
                              </span>
                              <span className="text-muted-foreground">
                                {formatCurrency(project.budget)} budget
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-4" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Project Details */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">
                {selectedProject ? selectedProject.name : 'Project Details'}
              </CardTitle>
              {selectedProject && (
                <CardDescription>
                  {selectedProject.source_person 
                    ? `From ${selectedProject.source_person}` 
                    : 'No source specified'
                  }
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!selectedProject ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a project to view details</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Project Info */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-accent/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Budget</p>
                      <p className="font-medium">{formatCurrency(selectedProject.budget)}</p>
                    </div>
                    <div className="bg-accent/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Spent</p>
                      <p className="font-medium">{formatCurrency(selectedProject.spent)}</p>
                    </div>
                    <div className="bg-accent/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Balance</p>
                      <p className={cn(
                        "font-medium",
                        (selectedProject.budget - selectedProject.spent) < 0 ? "text-red-500" : ""
                      )}>
                        {formatCurrency(selectedProject.budget - selectedProject.spent)}
                      </p>
                    </div>
                    <div className="bg-accent/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Tax Treatment</p>
                      <p className="font-medium capitalize text-xs">
                        {selectedProject.tax_treatment || 'Standard'}
                      </p>
                    </div>
                  </div>

                  {/* Expenses */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Expenses ({receipts.length})
                    </h4>
                    {loadingReceipts ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : receipts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No expenses recorded yet
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {receipts.map((receipt) => (
                          <div
                            key={receipt.id}
                            className="flex items-center justify-between p-2 bg-accent/30 rounded-lg text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{receipt.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {receipt.category || 'Uncategorized'} · {new Date(receipt.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="font-medium text-foreground ml-2">
                              {formatCurrency(receipt.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Warning if over budget */}
                  {selectedProject.spent > selectedProject.budget && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-red-600">Over Budget</p>
                        <p className="text-red-500/80 text-xs">
                          Excess may be taxable as income
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}