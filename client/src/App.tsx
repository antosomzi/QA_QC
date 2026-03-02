import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AnnotationTool from "@/pages/annotation-tool";
import ProjectList from "@/pages/project-list";
import ProjectDetail from "@/pages/project-detail";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AuthGuard from "@/components/auth-guard";

function Router() {
  return (
  <Switch>
    <Route path="/login" component={LoginPage} />
    <AuthGuard>
      <Switch>
        <Route path="/" component={ProjectList} />
        <Route path="/project/:projectId" component={ProjectDetail} />
        <Route path="/folder/:folderId" component={AnnotationTool} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;