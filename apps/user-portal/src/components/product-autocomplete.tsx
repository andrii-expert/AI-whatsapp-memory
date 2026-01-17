"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@imaginecalendar/ui/input";
import { cn } from "@imaginecalendar/ui/cn";

interface ProductSuggestion {
  name: string;
  category?: string;
}

interface ProductAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function ProductAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Milk",
  className,
  id,
}: ProductAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch product suggestions from API
  const fetchSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Failed to fetch product suggestions:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: ProductSuggestion) => {
    onChange(suggestion.name);
    setShowSuggestions(false);
    setSuggestions([]);
    if (onSelect) {
      onSelect(suggestion.name);
    }
    inputRef.current?.blur();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSuggestions([]);
        break;
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        style={{
          border: 0
        }}
      />
      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div
          ref={suggestionsRef}
          className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
          }}
        >
          {isLoading ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              Searching...
            </div>
          ) : suggestions.length > 0 ? (
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.name}-${index}`}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className={cn(
                    "px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors",
                    selectedIndex === index && "bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">{suggestion.name}</span>
                    {suggestion.category && (
                      <span className="text-xs text-gray-500 ml-2">
                        {suggestion.category}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

