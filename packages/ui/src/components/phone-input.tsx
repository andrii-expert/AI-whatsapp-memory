"use client";

import * as React from "react";
import { cn } from "../utils";
import { Input } from "./input";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { countryCodes, getCountryByCode, DEFAULT_COUNTRY_CODE, type CountryCode } from "../utils/country-codes";

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  defaultCountry?: string;
  error?: boolean;
}

export function PhoneInput({
  value = "",
  onChange,
  defaultCountry = DEFAULT_COUNTRY_CODE,
  className,
  error,
  disabled,
  ...props
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedCountry, setSelectedCountry] = React.useState<CountryCode | undefined>(
    getCountryByCode(defaultCountry)
  );
  const [phoneNumber, setPhoneNumber] = React.useState("");

  // Parse the initial value if it includes a country code
  React.useEffect(() => {
    if (value) {
      // Check if value starts with a country code
      const matchedCountry = countryCodes.find(country =>
        value.startsWith(country.dial_code)
      );

      if (matchedCountry) {
        setSelectedCountry(matchedCountry);
        setPhoneNumber(value.slice(matchedCountry.dial_code.length));
      } else if (!value.startsWith('+')) {
        // If no country code, assume it's just the number
        setPhoneNumber(value);
      }
    }
  }, []);

  const handleCountrySelect = (country: CountryCode) => {
    setSelectedCountry(country);
    setOpen(false);

    // Update the full phone number
    if (onChange) {
      const fullNumber = normalizePhoneNumber(country.dial_code, phoneNumber);
      onChange(fullNumber);
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setPhoneNumber(input);

    if (onChange && selectedCountry) {
      const fullNumber = normalizePhoneNumber(selectedCountry.dial_code, input);
      onChange(fullNumber);
    }
  };

  const normalizePhoneNumber = (dialCode: string, number: string): string => {
    // Remove any non-digit characters except the leading +
    let cleanNumber = number.replace(/[^\d]/g, '');

    // For South Africa (+27), remove leading 0 if present
    if (dialCode === '+27' && cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    }

    // Return the full international format
    return `${dialCode}${cleanNumber}`;
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-[120px] justify-between font-normal",
              error && "border-red-500",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled}
            type="button"
          >
            {selectedCountry ? (
              <span className="flex items-center gap-2">
                <span className="text-lg">{selectedCountry.flag}</span>
                <span className="text-sm">{selectedCountry.dial_code}</span>
              </span>
            ) : (
              <span>Select...</span>
            )}
            <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search country..."
              className="h-9"
            />
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              <CommandList className="max-h-[300px] overflow-y-auto">
                {countryCodes.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.dial_code}`}
                    onSelect={() => handleCountrySelect(country)}
                  >
                    <span className="flex items-center gap-2 flex-1">
                      <span className="text-lg">{country.flag}</span>
                      <span className="flex-1">{country.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {country.dial_code}
                      </span>
                    </span>
                    <CheckIcon
                      className={cn(
                        "ml-2 h-4 w-4",
                        selectedCountry?.code === country.code
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandList>
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        type="tel"
        placeholder={selectedCountry?.code === 'ZA' ? "82 123 4567" : "Phone number"}
        value={phoneNumber}
        onChange={handlePhoneNumberChange}
        className={cn(
          "flex-1 placeholder:italic placeholder:text-white/60",
          error && "border-red-500"
        )}
        disabled={disabled}
        {...props}
      />
    </div>
  );
}