import { CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

interface RegistrationSuccessProps {
  fullName: string;
  redirecting?: boolean;
}

export default function RegistrationSuccess({ fullName, redirecting }: RegistrationSuccessProps) {
  const firstName = fullName.split(' ')[0];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <Card className="border-border">
          <CardContent className="pt-8 pb-6">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              Welcome to PRISM, {firstName}! 🎉
            </h1>
            <p className="text-muted-foreground mb-6">
              Your account has been created successfully.
            </p>

            {redirecting && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Redirecting to your dashboard...</span>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Not redirected?{' '}
                <Link to="/dashboard" className="text-primary hover:underline">
                  Go to Dashboard
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
