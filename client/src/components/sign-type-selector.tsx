import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGN_TYPES, type SignType } from "@/data/sign-types";

interface SignTypeSelectorProps {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
}

export default function SignTypeSelector({ 
  value, 
  onValueChange, 
  placeholder = "Search and select a sign type..." 
}: SignTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter signs based on search query
  const filteredSigns = useMemo(() => {
    if (!searchQuery) return SIGN_TYPES.slice(0, 50); // Limit initial results
    
    const query = searchQuery.toLowerCase();
    return SIGN_TYPES.filter(sign => 
      sign.id.toLowerCase().includes(query) ||
      sign.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Get displayed signs and check if there are more
  const displayedSigns = filteredSigns.slice(0, 100);
  const hasMoreResults = filteredSigns.length > displayedSigns.length;

  // Get selected sign
  const selectedSign = value ? SIGN_TYPES.find(sign => sign.id === value) : undefined;

  // Update input display based on selection
  useEffect(() => {
    if (selectedSign && !open) {
      setSearchQuery(selectedSign.name);
    } else if (!selectedSign && !open) {
      setSearchQuery("");
    }
  }, [selectedSign, open]);

  const handleSelect = (signId: string) => {
    const sign = SIGN_TYPES.find(s => s.id === signId);
    onValueChange(signId);
    setSearchQuery(sign?.name || "");
    setOpen(false);
  };

  const handleClear = () => {
    onValueChange(undefined);
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    
    // Clear selection if input doesn't match current selection
    if (selectedSign && newValue !== selectedSign.name) {
      onValueChange(undefined);
    }
    
    // Open dropdown when typing
    if (!open && newValue.length > 0) {
      setOpen(true);
    }
  };

  const handleInputFocus = () => {
    setOpen(true);
    // Clear input when focusing to allow search
    if (selectedSign) {
      setSearchQuery("");
    }
  };

  const handleInputBlur = () => {
    // Small delay to allow selection to happen
    setTimeout(() => {
      setOpen(false);
      // Restore display value if we have a selection
      if (selectedSign) {
        setSearchQuery(selectedSign.name);
      }
    }, 200);
  };

  return (
    <div className="w-full">
      <Label className="text-sm font-medium">Sign Type</Label>
      <div className="relative">
        <div className="flex items-center gap-2">
          {selectedSign && (
            <img
              src={selectedSign.imagePath}
              alt={selectedSign.name}
              className="w-6 h-6 object-contain flex-shrink-0 absolute left-2 top-1/2 transform -translate-y-1/2 z-10"
              loading="lazy"
            />
          )}
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            className={cn(
              "w-full",
              selectedSign ? "pl-10" : "pl-3"
            )}
          />
          {selectedSign && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
              onClick={handleClear}
            >
              <X className="h-4 w-4 opacity-50 hover:opacity-100" />
            </Button>
          )}
        </div>
        
        {open && (displayedSigns.length > 0 || searchQuery) && (
          <div className="absolute top-full left-0 right-0 z-[10001] mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
            {displayedSigns.map((sign) => (
              <div
                key={sign.id}
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent"
                onMouseDown={() => handleSelect(sign.id)} // Use onMouseDown to prevent blur
              >
                <img
                  src={sign.imagePath}
                  alt={sign.name}
                  className="w-6 h-6 object-contain flex-shrink-0"
                  loading="lazy"
                />
                <span className="flex-1 truncate">{sign.name}</span>
                {value === sign.id && (
                  <Check className="h-4 w-4 opacity-100" />
                )}
              </div>
            ))}
            
            {/* Show more results indicator */}
            {hasMoreResults && (
              <div className="p-2 text-xs text-muted-foreground text-center border-t bg-muted/30">
                ... and {filteredSigns.length - displayedSigns.length} more results. Keep typing to narrow down.
              </div>
            )}
            
            {/* No results message */}
            {searchQuery && displayedSigns.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No sign types found for "{searchQuery}"
              </div>
            )}
            
            {/* Initial state hint */}
            {!searchQuery && displayedSigns.length > 0 && (
              <div className="p-2 text-xs text-muted-foreground text-center border-t bg-muted/30">
                Showing {displayedSigns.length} of {SIGN_TYPES.length} total signs. Start typing to search...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
