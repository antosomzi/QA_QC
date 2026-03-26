import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGN_TYPES, type SignType } from "@/data/sign-types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

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
  const selectedSign = value 
    ? SIGN_TYPES.find(sign => sign.id === value) 
    : undefined;

  // Update input display based on selection
  useEffect(() => {
    if (selectedSign) {
      setSearchQuery(selectedSign.name);
    } else {
      setSearchQuery("");
    }
  }, [selectedSign]);

  const handleSelect = (signId: string) => {
    const sign = SIGN_TYPES.find(s => s.id === signId);
    onValueChange(signId);
    setSearchQuery(sign?.name || "");
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Empêche la propagation du clic
    onValueChange(undefined);
    setSearchQuery("");
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

  const handleInputClick = () => {
    setOpen(true);
  };

  return (
    <div className="space-y-2">
      <Label>Sign Type</Label>
      
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={searchQuery}
              onChange={handleInputChange}
              onClick={handleInputClick}
              className={cn(
                "pr-20",
                selectedSign && "pr-20"
              )}
            />
            {selectedSign && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Check className="h-4 w-4 text-green-600" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive/10"
                  onClick={handleClear}
                  onMouseDown={(e) => e.preventDefault()} // Empêche le blur de l'input
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </PopoverTrigger>
        
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 z-[100001]"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault(); // Empêche le focus automatique
            inputRef.current?.focus();
          }}
        >
          <div className="max-h-[300px] overflow-y-auto">
            {displayedSigns.map((sign) => (
              <HoverCard key={sign.id} openDelay={500} closeDelay={200}>
                <HoverCardTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent transition-colors",
                      value === sign.id && "bg-accent"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Empêche le blur de l'input
                      handleSelect(sign.id);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={sign.imagePath}
                        alt={sign.name}
                        className="w-8 h-8 object-contain flex-shrink-0"
                        loading="lazy"
                      />
                      <span className="text-sm">{sign.name}</span>
                    </div>
                    {value === sign.id && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="right" className="w-auto p-2">
                  <img
                    src={sign.imagePath}
                    alt={sign.name}
                    className="w-18 h-18 object-contain"
                  />
                </HoverCardContent>
              </HoverCard>
            ))}

            {/* Show more results indicator */}
            {hasMoreResults && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                ... and {filteredSigns.length - displayedSigns.length} more results. Keep typing to narrow down.
              </div>
            )}

            {/* No results message */}
            {searchQuery && displayedSigns.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No sign types found for "{searchQuery}"
              </div>
            )}

            {/* Initial state hint */}
            {!searchQuery && displayedSigns.length > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                Showing {displayedSigns.length} of {SIGN_TYPES.length} total signs. Start typing to search...
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}