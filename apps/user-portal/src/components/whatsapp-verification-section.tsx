"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Copy, Smartphone, RefreshCw } from "lucide-react";

interface WhatsAppVerificationSectionProps {
  phoneNumber: string;
  redirectFrom?: string;
}

export function WhatsAppVerificationSection({ phoneNumber, redirectFrom }: WhatsAppVerificationSectionProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const { toast } = useToast();
  const trpc = useTRPC();
  const router = useRouter();

  // Generate verification code mutation
  const generateCodeMutation = useMutation(
    trpc.whatsapp.generateVerificationCode.mutationOptions({
      onSuccess: (data) => {
        setVerificationCode(data.code);
        generateQRCode(data.code);
        toast({
          title: "Verification code generated",
          description: "Scan the QR code or click the button to verify via WhatsApp",
          variant: "success",
        });
        setIsGenerating(false);
      },
      onError: (error) => {
        toast({
          title: "Generation failed",
          description: "Failed to generate verification code. Please try again.",
          variant: "error",
          duration: 3500,
        });
        setIsGenerating(false);
      },
    })
  );

  // Auto-generate code when component mounts
  useEffect(() => {
    if (phoneNumber && !verificationCode) {
      handleGenerateCode();
    }
  }, [phoneNumber]);

  const generateQRCode = async (code: string) => {
    try {
      setIsGenerating(true);

      // Use the business WhatsApp number from environment variables
      const businessWhatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "1234567890";

      // Create WhatsApp message with verification code
      const message = `Hello! I'd like to connect my WhatsApp to CrackOn for voice-based calendar management. My verification code is: ${code}`;

      // WhatsApp URL format - points to YOUR business number
      const whatsappUrl = `https://wa.me/${businessWhatsappNumber}?text=${encodeURIComponent(message)}`;

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(whatsappUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#ffffff',
          light: '#000000'
        }
      });

      setQrCodeUrl(qrDataUrl);
    } catch (error) {
      toast({
        title: "QR Code generation failed",
        description: "Failed to generate QR code. Please try again.",
        variant: "error",
        duration: 3500,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!verificationCode) return;

    // Use the business WhatsApp number from environment variables
    const businessWhatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "1234567890";
    const message = `Hello! I'd like to connect my WhatsApp to CrackOn for voice-based calendar management. My verification code is: ${verificationCode}`;
    const whatsappUrl = `https://wa.me/${businessWhatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');

    // Redirect back to where user came from after 2 seconds
    setTimeout(() => {
      if (redirectFrom === 'profile') {
        router.push('/settings/profile');
      } else {
        // Default to dashboard
        router.push('/dashboard');
      }
    }, 2000);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Verification code copied to clipboard",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "error",
        duration: 3500,
      });
    }
  };

  const handleGenerateCode = () => {
    setIsGenerating(true);
    generateCodeMutation.mutate({ phoneNumber });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          WhatsApp Verification Required
        </CardTitle>
        <CardDescription>
          Verify your WhatsApp number to start managing your calendar with voice commands
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Why verify section */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800 font-medium mb-2">
            Once verified, you'll be able to:
          </p>
          <ul className="text-sm text-blue-700 ml-4 list-disc space-y-1">
            <li>Send voice notes to create and manage calendar events</li>
            <li>Use natural language to schedule appointments</li>
            <li>Receive calendar notifications and reminders via WhatsApp</li>
            <li>Update or cancel events through voice messages</li>
          </ul>
        </div>

        {/* Verification content */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* QR Code - Hidden on mobile */}
          <div className="space-y-4 hidden md:block">
            <h3 className="font-medium text-center">Scan QR Code</h3>
            <div className="flex justify-center">
              {qrCodeUrl ? (
                <div className="p-4 bg-white border rounded-lg shadow-sm">
                  <img
                    src={qrCodeUrl}
                    alt="WhatsApp Verification QR Code"
                    className="w-48 h-48"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center border rounded-lg bg-muted">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Generating...</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Scan with your phone camera or WhatsApp scanner
            </p>
          </div>

          {/* Action options */}
          <div className="space-y-4 md:col-span-1 col-span-2">
            <h3 className="font-medium text-center md:text-left">
              <span className="md:hidden">Complete Verification</span>
              <span className="hidden md:inline">Or Use These Options</span>
            </h3>

            {/* Verification Code */}
            {verificationCode && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Your verification code:</p>
                      <p className="text-xl font-mono text-primary">{verificationCode}</p>
                    </div>
                    {/* Copy button - Hidden on mobile */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(verificationCode)}
                      className="hidden md:flex"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructions */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800 font-medium mb-1">
                How to verify:
              </p>
              <ol className="text-sm text-blue-700 ml-4 list-decimal space-y-1">
                <li>Tap "Open WhatsApp" button below</li>
                <li>Send the pre-filled message with your verification code</li>
                <li>Wait for confirmation from our system</li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleOpenWhatsApp}
                className="w-full"
                variant="blue-primary"
                size="lg"
                disabled={!verificationCode}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Open WhatsApp & Send Message
              </Button>

              <Button
                onClick={handleGenerateCode}
                variant="outline"
                disabled={isGenerating}
                size="sm"
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? "Generating..." : "Generate New Code"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}