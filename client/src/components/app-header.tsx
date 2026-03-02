import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut } from "lucide-react";
import { useLocation } from "wouter";

interface AppHeaderProps {
  /** Content rendered in the center/left area after the app name */
  children?: React.ReactNode;
  /** Right-side actions (buttons etc.) rendered before the user menu */
  actions?: React.ReactNode;
}

export default function AppHeader({ children, actions }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm px-6 py-3 flex items-center justify-between">
      {/* Left side: App name + optional children */}
      <div className="flex items-center gap-4">
        <a href="/" className="text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors">
          QA/QC Annotation
        </a>
        {children && (
          <>
            <span className="text-gray-300">|</span>
            {children}
          </>
        )}
      </div>

      {/* Right side: actions + org info + user menu */}
      <div className="flex items-center gap-4">
        {actions}
        
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {user.organizationName}
            </span>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground">{user.organizationName}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
