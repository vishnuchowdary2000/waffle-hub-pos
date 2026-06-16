import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UtensilsCrossed, AlertCircle } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
            <UtensilsCrossed size={32} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Waffle Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Business Control Module</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-foreground mb-5">Sign in</h2>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          The Waffle Hub BCM · v2
        </p>
      </div>
    </div>
  );
}
