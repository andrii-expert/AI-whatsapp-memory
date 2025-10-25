"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Button } from "@imaginecalendar/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@imaginecalendar/ui/dialog";
import { Card, CardContent } from "@imaginecalendar/ui/card";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquare, Copy, Smartphone } from "lucide-react";

interface WhatsAppVerificationModalProps {
  children: React.ReactNode;
}

export function WhatsAppVerificationModal({ children }: WhatsAppVerificationModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const { toast } = useToast();
  const trpc = useTRPC();

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

  const generateQRCode = async (code: string) => {
    try {
      setIsGenerating(true);

      // Use the business WhatsApp number from environment variables
      const businessWhatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "1234567890";

      // Create WhatsApp message with verification code
      const message = `Hello! I'd like to connect my WhatsApp to ImagineCalendar for voice-based calendar management. My verification code is: ${code}`;

      // WhatsApp URL format - points to YOUR business number
      const whatsappUrl = `https://wa.me/${businessWhatsappNumber}?text=${encodeURIComponent(message)}`;

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(whatsappUrl, {
        width: 256,
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
    const message = `Hello! I'd like to connect my WhatsApp to ImagineCalendar for voice-based calendar management. My verification code is: ${verificationCode}`;
    const whatsappUrl = `https://wa.me/${businessWhatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
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
    generateCodeMutation.mutate({});
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp QR Code
          </DialogTitle>
          <DialogDescription>
            Scan the QR code to connect your WhatsApp for voice-based calendar management
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-4 p-4">
          {!verificationCode ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a verification code to connect your WhatsApp for calendar voice commands
              </p>
              <Button
                onClick={handleGenerateCode}
                disabled={isGenerating}
                size="lg"
                className="w-full"
              >
                {isGenerating ? "Generating..." : "Generate QR Code"}
              </Button>
            </div>
          ) : (
            <>
              {/* QR Code */}
              <Card className="w-full">
                <CardContent className="flex justify-center p-6">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt="WhatsApp QR Code"
                      className="w-64 h-64 border rounded-lg"
                    />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center border rounded-lg bg-muted">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">Generating QR code...</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Instructions */}
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Scan the QR code with your phone camera or WhatsApp to start the conversation
                </p>
                <p className="text-xs text-muted-foreground">
                  Send voice notes to create and manage your calendar events
                </p>
              </div>

              {/* Verification Code Display */}
              <Card className="w-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Verification Code:</p>
                      <p className="text-lg font-mono text-primary">{verificationCode}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(verificationCode)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  onClick={handleOpenWhatsApp}
                  className="flex-1"
                  size="lg"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Open WhatsApp
                </Button>
                <Button
                  onClick={handleGenerateCode}
                  variant="outline"
                  disabled={isGenerating}
                  size="lg"
                >
                  {isGenerating ? "Generating..." : "Regenerate"}
                </Button>
              </div>

              {/* Footer Text */}
              <div className="text-xs text-muted-foreground text-center max-w-sm">
                Once verified, you can send voice notes to create appointments, meetings, and manage your entire calendar.
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}