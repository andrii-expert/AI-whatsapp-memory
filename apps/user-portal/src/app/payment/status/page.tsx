'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@imaginecalendar/ui/card';
import { Button } from '@imaginecalendar/ui/button';
import { useToast } from '@imaginecalendar/ui/use-toast';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function PaymentStatusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const status = searchParams.get('status');
  const message = searchParams.get('message');
  
  const isSuccess = status === 'success';
  const isCancelled = status === 'cancelled';

  useEffect(() => {
    if (isSuccess) {
      toast({
        title: 'Payment Successful!',
        description: 'Your subscription is now active.',
        variant: 'default',
      });
      
      // Redirect to dashboard after 3 seconds
      const timer = setTimeout(() => {
        router.push('/dashboard');
      }, 3000);

      return () => clearTimeout(timer);
    } else if (isCancelled) {
      toast({
        title: 'Payment Cancelled',
        description: 'You can try again or continue with the free trial.',
        variant: 'destructive',
      });
    }
  }, [isSuccess, isCancelled, router, toast]);

  // If no status, show loading (shouldn't happen but good fallback)
  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing payment...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Payment Successful!
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Payment {isCancelled ? 'Cancelled' : 'Failed'}
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {message || 'Processing your payment status...'}
          </p>
          
          {isSuccess ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Redirecting to dashboard in a moment...
              </p>
              <Button 
                onClick={() => router.push('/dashboard')}
                className="w-full"
              >
                Go to Dashboard Now
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button 
                onClick={() => router.push('/billing')}
                className="flex-1"
              >
                Try Again
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push('/dashboard')}
                className="flex-1"
              >
                Continue with Trial
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading payment status...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PaymentStatusContent />
    </Suspense>
  );
}