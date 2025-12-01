import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CanopyIcon } from "@/components/icons";
import { appClient } from "@/clients";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  // TODO: Replace this placeholder video ID with actual Canopy intro video
  const videoId = "dQw4w9WgXcQ";

  const handleGetStarted = async () => {
    try {
      await appClient.setState({ hasSeenWelcome: true });
    } catch (err) {
      console.error("Failed to save welcome state", err);
    }
    onDismiss();
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-canopy-bg p-8 text-center overflow-y-auto">
      <div className="max-w-4xl w-full flex flex-col items-center gap-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="h-16 w-16 bg-canopy-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CanopyIcon className="w-10 h-10 text-canopy-accent" />
          </div>
          <h1 className="text-4xl font-bold text-canopy-text tracking-tight">Welcome to Canopy</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Your AI-native command center for orchestrating agents, managing worktrees, and
            accelerating development.
          </p>
        </div>

        {/* Video Container */}
        <div className="w-full aspect-video bg-canopy-sidebar rounded-xl overflow-hidden border border-canopy-border shadow-2xl relative group">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
            title="Welcome to Canopy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* Action Section */}
        <div className="flex flex-col items-center gap-4 mt-4">
          <Button
            size="lg"
            onClick={handleGetStarted}
            className="px-8 py-6 text-lg bg-canopy-accent hover:bg-canopy-accent/90 text-white shadow-lg shadow-canopy-accent/20 transition-all hover:scale-105"
          >
            Get Started
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="text-xs text-gray-500">
            You can return to this screen anytime by clicking the Help icon in the toolbar.
          </p>
        </div>
      </div>
    </div>
  );
}
