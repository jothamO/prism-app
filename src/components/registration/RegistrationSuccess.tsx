import { CheckCircle, Send, ExternalLink, LayoutDashboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

interface RegistrationSuccessProps {
  fullName: string;
  telegramLink?: string;
  platform: 'telegram' | 'whatsapp' | 'web';
  redirecting?: boolean;
}

export default function RegistrationSuccess({
  telegramLink,
  fullName,
  platform,
  redirecting
}: RegistrationSuccessProps) {
  const firstName = fullName.split(' ')[0];

  // Web-only registration success (auto-redirect variant)
  if (platform === 'web') {
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
                <div className="flex items-center justify-center gap-2 text-muted-foreground mb-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Redirecting to your dashboard...</span>
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-4 text-left mb-4">
                <h3 className="font-medium text-foreground mb-2">Next steps:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Go to your dashboard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Connect your Telegram for alerts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Connect your bank account</span>
                  </li>
                </ol>
              </div>

              <Link to="/dashboard" className="block">
                <Button className="w-full h-12 text-base" size="lg">
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  Go to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // WhatsApp coming soon
  if (platform === 'whatsapp') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Card className="border-border">
            <CardContent className="pt-8 pb-6">
              <div className="flex justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-2">
                Welcome, {firstName}! 🎉
              </h1>
              <p className="text-muted-foreground mb-8">
                Your account has been created! WhatsApp integration is coming soon. In the meantime, you can use the web dashboard.
              </p>

              <div className="space-y-4">
                <Link to="/dashboard" className="block">
                  <Button className="w-full h-12 text-base" size="lg">
                    <LayoutDashboard className="h-5 w-5 mr-2" />
                    Go to Dashboard
                  </Button>
                </Link>

                <p className="text-sm text-muted-foreground">
                  We'll notify you when WhatsApp is available.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Telegram flow
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

            {telegramLink && (
              <div className="space-y-4 mb-6">
                <p className="text-sm text-muted-foreground">
                  Click below to connect your Telegram account:
                </p>
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg transition-colors"
                >
                  <Send className="h-5 w-5" />
                  Open in Telegram
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Or go directly to your{' '}
                <Link to="/dashboard" className="text-primary hover:underline">
                  Dashboard
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
