import { CheckCircle, Send, ExternalLink, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

interface RegistrationSuccessProps {
  telegramLink: string;
  fullName: string;
  platform: 'telegram' | 'whatsapp' | 'web';
}

export default function RegistrationSuccess({ telegramLink, fullName, platform }: RegistrationSuccessProps) {
  const firstName = fullName.split(' ')[0];

  // Web-only registration success
  if (platform === 'web') {
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
                Your account has been created successfully. You can now access your dashboard to manage your taxes.
              </p>

              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-left">
                  <h3 className="font-medium text-foreground mb-2">Next steps:</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                      <span>Go to your dashboard</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                      <span>Connect your bank account via Mono</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                      <span>Upload your first bank statement</span>
                    </li>
                  </ol>
                </div>

                <Link to="/dashboard" className="block">
                  <Button className="w-full h-12 text-base" size="lg">
                    <LayoutDashboard className="h-5 w-5 mr-2" />
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
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

  // Telegram flow (existing)
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
              Your account has been created successfully. Now let's connect your Telegram to complete the setup.
            </p>

            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-left">
                <h3 className="font-medium text-foreground mb-2">Next steps:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Click the button below to open Telegram</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Press "Start" in the PRISM bot</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Connect your bank account via Mono</span>
                  </li>
                </ol>
              </div>

              <a
                href={telegramLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full h-12 text-base" size="lg">
                  <Send className="h-5 w-5 mr-2" />
                  Open Telegram
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </a>

              <p className="text-xs text-muted-foreground">
                Link expires in 15 minutes. If it expires, you can log in and request a new link.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Already connected?{' '}
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
