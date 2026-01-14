"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@imaginecalendar/ui/button";
import { Label } from "@imaginecalendar/ui/label";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { Copy, Smartphone, RefreshCw } from "lucide-react";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";

interface WhatsAppVerificationSectionProps {
  phoneNumber: string;
  redirectFrom?: string;
  shouldGenerateCode?: boolean; // Only generate code when explicitly requested (e.g., after editing phone)
  alwaysGenerateNewCode?: boolean; // Always generate a new code on mount (for page visits)
}

export function WhatsAppVerificationSection({ 
  phoneNumber, 
  redirectFrom, 
  shouldGenerateCode = false,
  alwaysGenerateNewCode = false 
}: WhatsAppVerificationSectionProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const previousPhoneRef = useRef<string>("");
  const hasGeneratedOnMountRef = useRef<boolean>(false);
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

  // ALWAYS generate a new code on component mount when alwaysGenerateNewCode is true
  // This ensures a fresh code every time user visits the page
  useEffect(() => {
    if (!phoneNumber || !alwaysGenerateNewCode) return;
    
    // Only generate once on mount
    if (hasGeneratedOnMountRef.current) return;
    
    hasGeneratedOnMountRef.current = true;
    
    // Always generate a new code (fresh code on every page visit)
    handleGenerateCode();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber, alwaysGenerateNewCode]);

  // Generate NEW code when explicitly requested via shouldGenerateCode prop
  // This happens when user edits and saves a new phone number
  useEffect(() => {
    if (!phoneNumber || !shouldGenerateCode) {
      // Reset previous phone ref when shouldGenerateCode is false
      if (!shouldGenerateCode && previousPhoneRef.current !== phoneNumber) {
        previousPhoneRef.current = phoneNumber;
      }
      return;
    }
    
    const phoneChanged = previousPhoneRef.current !== phoneNumber;
    
    // Only generate if phone changed (user edited phone number)
    if (phoneChanged) {
      previousPhoneRef.current = phoneNumber;
      // Clear existing code and generate new one
      setVerificationCode("");
      setQrCodeUrl("");
      handleGenerateCode();
    } else {
      // Update ref even if we don't generate
      previousPhoneRef.current = phoneNumber;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber, shouldGenerateCode]);

  const generateQRCode = async (code: string) => {
    try {
      setIsGenerating(true);

      // Use the business WhatsApp number from environment variables
      const businessWhatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "27716356371";

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
    const businessWhatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "27716356371";
    const message = `Hello! I'd like to connect my WhatsApp to CrackOn for voice-based calendar management. My verification code is: ${verificationCode}`;
    const whatsappUrl = `https://wa.me/${businessWhatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');

    // Don't redirect - stay on the page so user can see verification status
    // The page will automatically update when verification is detected via polling
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
    if (!phoneNumber) {
      toast({
        title: "Phone number required",
        description: "Please provide a phone number to generate a verification code.",
        variant: "error",
      });
      return;
    }
    
    // Normalize the phone number before sending
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    if (!normalizedPhone || normalizedPhone.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with country code.",
        variant: "error",
      });
      return;
    }
    
    setIsGenerating(true);
    generateCodeMutation.mutate({ phoneNumber: normalizedPhone });
  };

  return (
    <div className="space-y-6">
      {/* Verification content */}
      <div className="space-y-4">
        {/* QR Code - Hidden on mobile */}
        <div className="space-y-3 hidden md:block">
          <h3 className="text-sm font-medium text-gray-700">Scan QR Code</h3>
          <div className="flex justify-center">
            {qrCodeUrl ? (
              <div className="p-4 bg-white border border-gray-200 rounded-lg">
                <img
                  src={qrCodeUrl}
                  alt="WhatsApp Verification QR Code"
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="w-48 h-48 flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Generating...</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center">
            Scan with your phone camera or WhatsApp scanner
          </p>
        </div>

        {/* Verification Code */}
        {verificationCode && (
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Verification Code
            </Label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <p className="text-xl font-mono text-gray-900">{verificationCode}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(verificationCode)}
                className="border-gray-300"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
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
            className="w-full border-gray-300"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? "Generating..." : "Generate New Code"}
          </Button>
        </div>
      </div>
    </div>
  );
}